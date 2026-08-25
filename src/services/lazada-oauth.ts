import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";
import { query, type Database, type Transaction } from "../db.js";
import { decryptField, encryptField, randomToken } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { signLazadaRequest } from "./lazada-open-api.js";

/**
 * OAuth Lazada Open Platform cho tích hợp Lazada của HỆ THỐNG ShopTik:
 * authorization code → access/refresh token → tự refresh khi sắp hết hạn.
 *
 * - Token lưu MÃ HÓA (AES-256-GCM, FIELD_ENCRYPTION_KEY) trong bảng singleton
 *   `lazada_oauth_tokens`; không bao giờ plaintext, không bao giờ ghi ra log.
 * - `state` chống CSRF: tự chứa (nonce + hạn 15 phút), ký HMAC bằng APP_SECRET
 *   — callback không phụ thuộc cookie (cùng lý do với luồng Google mobile).
 * - Các endpoint auth của Lazada ký cùng lược đồ "TOP" với Open API
 *   (signLazadaRequest) nhưng đi qua https://auth.lazada.com/rest.
 *
 * LƯU Ý phạm vi: đây là vòng đời TOKEN. Việc lấy đơn/hoa hồng Affiliate qua
 * Open Platform phụ thuộc quyền Lazada cấp cho app (category Loyalty) — chưa
 * tự chế endpoint nào ở đây; luồng Affiliate Master Link hiện tại giữ nguyên.
 */

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

const AUTHORIZE_URL = "https://auth.lazada.com/oauth/authorize";
const AUTH_REST_BASE = "https://auth.lazada.com/rest";
const TOKEN_CREATE_PATH = "/auth/token/create";
const TOKEN_REFRESH_PATH = "/auth/token/refresh";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

/** Còn dưới mức này thì refresh trước khi dùng (yêu cầu: ~30 phút). */
const ACCESS_REFRESH_AHEAD_MS = 30 * 60 * 1000;
/** Refresh token sắp hết hạn trong 7 ngày → trạng thái TOKEN_EXPIRING. */
const REFRESH_EXPIRING_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 15 * 60 * 1000;
const STATE_PREFIX = "lz1";

/* ------------------------------------------------------------------ *
 * Cấu hình & URL
 * ------------------------------------------------------------------ */

/** App key + secret là đủ để bắt đầu OAuth (token sẽ lấy qua callback). */
export function isLazadaOAuthConfigured(config: AppConfig): boolean {
  return Boolean(
    config.LAZADA_OPEN_API_APP_KEY && config.LAZADA_OPEN_API_APP_SECRET,
  );
}

/**
 * Callback cố định của hệ thống. Trống thì suy ra từ APP_ORIGIN — production
 * phải ra đúng https://shoptikvn.com/auth/lazada/callback (khai trên Lazada
 * Open Platform). Không nhận redirect tùy ý từ ngoài vào.
 */
export function getLazadaOAuthRedirectUri(config: AppConfig): string {
  if (config.LAZADA_OAUTH_REDIRECT_URI) return config.LAZADA_OAUTH_REDIRECT_URI;
  return new URL("/auth/lazada/callback", config.APP_ORIGIN).toString();
}

/* ------------------------------------------------------------------ *
 * State chống CSRF (tự chứa, ký HMAC, có hạn)
 * ------------------------------------------------------------------ */

function signState(config: AppConfig, payload: string): string {
  return createHmac("sha256", config.APP_SECRET)
    .update(`${STATE_PREFIX}.${payload}`)
    .digest("base64url");
}

/** `ttlMs` chỉ dành cho test — mặc định 15 phút. */
export function createLazadaOAuthState(
  config: AppConfig,
  ttlMs: number = STATE_TTL_MS,
): string {
  const payload = Buffer.from(
    JSON.stringify({ n: randomToken(12), e: Date.now() + ttlMs }),
  ).toString("base64url");
  return `${STATE_PREFIX}.${payload}.${signState(config, payload)}`;
}

export function verifyLazadaOAuthState(
  config: AppConfig,
  state: unknown,
): boolean {
  if (typeof state !== "string") return false;
  const [prefix, payload, sig] = state.split(".");
  if (prefix !== STATE_PREFIX || !payload || !sig) return false;
  const expected = signState(config, payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { e?: unknown };
    return typeof data.e === "number" && data.e >= Date.now();
  } catch {
    return false;
  }
}

export function buildLazadaAuthorizationUrl(
  config: AppConfig,
  state: string,
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("force_auth", "true");
  url.searchParams.set("redirect_uri", getLazadaOAuthRedirectUri(config));
  url.searchParams.set("client_id", config.LAZADA_OPEN_API_APP_KEY);
  url.searchParams.set("state", state);
  return url.toString();
}

/* ------------------------------------------------------------------ *
 * Gọi endpoint auth của Lazada (token create / refresh)
 * ------------------------------------------------------------------ */

interface LazadaTokenPayload {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number;
  refreshExpiresInSec: number | null;
  country: string | null;
  account: string | null;
  accountId: string | null;
  metadata: JsonObject;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function optionalString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

/**
 * Gọi một endpoint auth của Lazada và trả payload token đã chuẩn hóa.
 * Lỗi ném AppError với thông điệp KHÔNG chứa secret/token/code.
 */
async function callLazadaAuthEndpoint(
  config: AppConfig,
  apiPath: string,
  extraParams: Record<string, string>,
  fetcher: Fetcher,
): Promise<LazadaTokenPayload> {
  if (!isLazadaOAuthConfigured(config)) {
    throw new AppError(
      "LAZADA_OAUTH_NOT_CONFIGURED",
      "Chưa cấu hình App Key/App Secret của Lazada.",
      503,
    );
  }
  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    ...extraParams,
  };
  const sign = signLazadaRequest(
    apiPath,
    params,
    config.LAZADA_OPEN_API_APP_SECRET,
  );
  const endpoint = new URL(`${AUTH_REST_BASE}${apiPath}`);
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }
  endpoint.searchParams.set("sign", sign);

  let payload: unknown;
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new AppError(
        "LAZADA_OAUTH_FAILED",
        "Lazada trả dữ liệu vượt giới hạn an toàn.",
        502,
      );
    }
    payload = JSON.parse(text);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Không kèm chi tiết lỗi gốc — có thể chứa URL mang tham số nhạy cảm.
    throw new AppError(
      "LAZADA_OAUTH_FAILED",
      "Không gọi được máy chủ Lazada. Hãy thử lại sau ít phút.",
      502,
    );
  }

  const root = asObject(payload);
  const accessToken = optionalString(root?.access_token);
  if (!root || !accessToken) {
    // `code` của Lazada ("0" = thành công) không nhạy cảm — đưa vào thông điệp
    // để admin biết loại lỗi; tuyệt đối không đưa token/authorization code.
    const lazadaCode = optionalString(root?.code) ?? "không rõ";
    const lazadaMessage = optionalString(root?.message) ?? "";
    throw new AppError(
      "LAZADA_OAUTH_FAILED",
      `Lazada từ chối cấp token (mã ${lazadaCode}${lazadaMessage ? ` — ${lazadaMessage.slice(0, 120)}` : ""}).`,
      502,
    );
  }

  const metadata: JsonObject = {};
  if (root.country_user_info !== undefined) {
    metadata.country_user_info = root.country_user_info;
  }
  if (root.account_platform !== undefined) {
    metadata.account_platform = root.account_platform;
  }

  return {
    accessToken,
    refreshToken: optionalString(root.refresh_token),
    expiresInSec: positiveInt(root.expires_in) ?? 3600,
    refreshExpiresInSec: positiveInt(root.refresh_expires_in),
    country: optionalString(root.country),
    account: optionalString(root.account),
    accountId: optionalString(root.account_id),
    metadata,
  };
}

/* ------------------------------------------------------------------ *
 * Lưu / đọc token (mã hóa at rest)
 * ------------------------------------------------------------------ */

interface TokenRow {
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  access_token_expires_at: Date;
  refresh_token_expires_at: Date;
  country: string | null;
  account: string | null;
  account_id: string | null;
  last_refresh_at: Date | null;
  updated_at: Date;
}

const SELECT_SQL = `
  SELECT access_token_ciphertext, refresh_token_ciphertext,
    access_token_expires_at, refresh_token_expires_at,
    country, account, account_id, last_refresh_at, updated_at
  FROM lazada_oauth_tokens
  WHERE id = true
`;

async function readTokenRow(
  db: Database | Transaction,
): Promise<TokenRow | null> {
  const result = await query<TokenRow>(db, SELECT_SQL);
  return result.rows[0] ?? null;
}

/**
 * Lưu bộ token mới (mã hóa). `isRefresh` đánh dấu lượt refresh để giữ
 * refresh token cũ khi Lazada không trả cái mới.
 */
export async function saveLazadaTokens(
  db: Database | Transaction,
  config: AppConfig,
  payload: LazadaTokenPayload,
  options: { isRefresh?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  const accessExpiresAt = new Date(now + payload.expiresInSec * 1000);
  const existing = options.isRefresh ? await readTokenRow(db) : null;

  const refreshCiphertext = payload.refreshToken
    ? encryptField(payload.refreshToken, config)
    : existing?.refresh_token_ciphertext;
  if (!refreshCiphertext) {
    throw new AppError(
      "LAZADA_OAUTH_FAILED",
      "Lazada không trả refresh token — hãy authorize lại.",
      502,
    );
  }
  const refreshExpiresAt = payload.refreshExpiresInSec
    ? new Date(now + payload.refreshExpiresInSec * 1000)
    : (existing?.refresh_token_expires_at ?? accessExpiresAt);

  await query(
    db,
    `
      INSERT INTO lazada_oauth_tokens (
        id, access_token_ciphertext, refresh_token_ciphertext,
        access_token_expires_at, refresh_token_expires_at,
        country, account, account_id, metadata, last_refresh_at
      ) VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
      ON CONFLICT (id) DO UPDATE SET
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
        country = COALESCE(EXCLUDED.country, lazada_oauth_tokens.country),
        account = COALESCE(EXCLUDED.account, lazada_oauth_tokens.account),
        account_id = COALESCE(EXCLUDED.account_id, lazada_oauth_tokens.account_id),
        metadata = CASE WHEN EXCLUDED.metadata = '{}'::jsonb
          THEN lazada_oauth_tokens.metadata ELSE EXCLUDED.metadata END,
        last_refresh_at = EXCLUDED.last_refresh_at,
        updated_at = now()
    `,
    [
      encryptField(payload.accessToken, config),
      refreshCiphertext,
      accessExpiresAt,
      refreshExpiresAt,
      payload.country,
      payload.account,
      payload.accountId,
      JSON.stringify(payload.metadata),
      options.isRefresh ? new Date(now) : null,
    ],
  );
}

/* ------------------------------------------------------------------ *
 * Đổi code / refresh / lấy token hợp lệ
 * ------------------------------------------------------------------ */

/** Callback: đổi authorization code lấy token rồi lưu ngay (mã hóa). */
export async function exchangeLazadaAuthorizationCode(
  db: Database | Transaction,
  config: AppConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<LazadaTokenStatus> {
  const payload = await callLazadaAuthEndpoint(
    config,
    TOKEN_CREATE_PATH,
    { code },
    fetcher,
  );
  await saveLazadaTokens(db, config, payload);
  return getLazadaTokenStatus(db, config);
}

/** Refresh access token bằng refresh token đang lưu. */
export async function refreshLazadaAccessToken(
  db: Database | Transaction,
  config: AppConfig,
  fetcher: Fetcher = fetch,
): Promise<string> {
  const row = await readTokenRow(db);
  if (!row) {
    throw new AppError(
      "LAZADA_OAUTH_NOT_CONNECTED",
      "Chưa kết nối Lazada — hãy authorize trước.",
      503,
    );
  }
  if (row.refresh_token_expires_at.getTime() <= Date.now()) {
    throw new AppError(
      "LAZADA_REAUTH_REQUIRED",
      "Refresh token Lazada đã hết hạn — cần authorize lại.",
      503,
    );
  }
  const refreshToken = decryptField(row.refresh_token_ciphertext, config);
  const payload = await callLazadaAuthEndpoint(
    config,
    TOKEN_REFRESH_PATH,
    { refresh_token: refreshToken },
    fetcher,
  );
  await saveLazadaTokens(db, config, payload, { isRefresh: true });
  return payload.accessToken;
}

// Chống nhiều request cùng refresh một lượt: gộp về MỘT promise đang chạy.
let refreshInFlight: Promise<string> | null = null;

/**
 * Token dùng được ngay cho Lazada Open API: còn hạn thì trả luôn; còn dưới
 * 30 phút thì refresh (single-flight) rồi trả token mới; hỏng/chưa kết nối
 * thì trả null để caller rơi về fallback (ENV) — không ném lỗi giữa luồng
 * tra cứu sản phẩm.
 */
export async function getValidLazadaAccessToken(
  db: Database | Transaction,
  config: AppConfig,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  try {
    const row = await readTokenRow(db);
    if (!row) return null;
    if (
      row.access_token_expires_at.getTime() - Date.now() >
      ACCESS_REFRESH_AHEAD_MS
    ) {
      return decryptField(row.access_token_ciphertext, config);
    }
    refreshInFlight ??= refreshLazadaAccessToken(db, config, fetcher).finally(
      () => {
        refreshInFlight = null;
      },
    );
    return await refreshInFlight;
  } catch {
    // Lỗi refresh (kể cả REAUTH_REQUIRED) không được chặn tra cứu sản phẩm —
    // trạng thái chi tiết xem ở getLazadaTokenStatus (trang Đồng bộ sàn).
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Trạng thái cho backoffice (không bao giờ trả token ra ngoài)
 * ------------------------------------------------------------------ */

export type LazadaOAuthStatusCode =
  | "NOT_CONFIGURED"
  | "NOT_CONNECTED"
  | "CONNECTED"
  | "TOKEN_EXPIRING"
  | "REAUTH_REQUIRED";

export interface LazadaTokenStatus {
  status: LazadaOAuthStatusCode;
  country: string | null;
  account: string | null;
  accountId: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  lastRefreshAt: Date | null;
  updatedAt: Date | null;
  redirectUri: string;
}

export async function getLazadaTokenStatus(
  db: Database | Transaction,
  config: AppConfig,
): Promise<LazadaTokenStatus> {
  const base = {
    country: null,
    account: null,
    accountId: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    lastRefreshAt: null,
    updatedAt: null,
    redirectUri: getLazadaOAuthRedirectUri(config),
  };
  if (!isLazadaOAuthConfigured(config)) {
    return { ...base, status: "NOT_CONFIGURED" };
  }
  const row = await readTokenRow(db);
  if (!row) return { ...base, status: "NOT_CONNECTED" };

  const now = Date.now();
  const status: LazadaOAuthStatusCode =
    row.refresh_token_expires_at.getTime() <= now
      ? "REAUTH_REQUIRED"
      : row.refresh_token_expires_at.getTime() - now <= REFRESH_EXPIRING_AHEAD_MS
        ? "TOKEN_EXPIRING"
        : "CONNECTED";

  return {
    status,
    country: row.country,
    account: row.account,
    accountId: row.account_id,
    accessTokenExpiresAt: row.access_token_expires_at,
    refreshTokenExpiresAt: row.refresh_token_expires_at,
    lastRefreshAt: row.last_refresh_at,
    updatedAt: row.updated_at,
    redirectUri: getLazadaOAuthRedirectUri(config),
  };
}
