import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database, withTransaction } from "../db.js";
import {
  hashSensitiveValue,
  normalizeEmail,
  randomReferralCode,
} from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import type { CurrentUser } from "../types/fastify.js";
import type { EmailService } from "./email.js";
import { loadUserPolicyFacts } from "./user-policy.js";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT =
  "https://openidconnect.googleapis.com/v1/userinfo";
const REQUEST_TIMEOUT_MS = 8000;

const PROVIDER = "GOOGLE";

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string;
}

/** Có đủ Client ID + Secret thì tính năng Google mới bật. */
export function googleOAuthEnabled(config: AppConfig): boolean {
  return Boolean(
    config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET,
  );
}

/** Redirect URI: ưu tiên biến cấu hình, mặc định suy ra từ APP_ORIGIN. */
export function googleRedirectUri(config: AppConfig): string {
  if (config.GOOGLE_OAUTH_REDIRECT_URI) {
    return config.GOOGLE_OAUTH_REDIRECT_URI;
  }
  return `${config.APP_ORIGIN.replace(/\/+$/, "")}/auth/google/callback`;
}

/** URL để chuyển hướng người dùng tới trang đồng ý của Google. */
export function buildGoogleAuthUrl(config: AppConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: googleRedirectUri(config),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function postToken(
  config: AppConfig,
  code: string,
): Promise<{ access_token?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: config.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: googleRedirectUri(config),
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AppError(
      "GOOGLE_TOKEN_ERROR",
      "Không đổi được mã đăng nhập với Google. Hãy thử lại.",
      502,
    );
  }
  return (await response.json()) as { access_token?: string };
}

/** Đổi authorization code lấy hồ sơ người dùng đã xác thực từ Google. */
export async function fetchGoogleProfile(
  config: AppConfig,
  code: string,
): Promise<GoogleProfile> {
  const token = await postToken(config, code);
  if (!token.access_token) {
    throw new AppError(
      "GOOGLE_TOKEN_ERROR",
      "Phản hồi đăng nhập Google không hợp lệ. Hãy thử lại.",
      502,
    );
  }

  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${token.access_token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AppError(
      "GOOGLE_USERINFO_ERROR",
      "Không lấy được thông tin tài khoản Google. Hãy thử lại.",
      502,
    );
  }
  const info = (await response.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
    given_name?: string;
    picture?: string;
  };

  if (!info.sub || !info.email) {
    throw new AppError(
      "GOOGLE_PROFILE_INCOMPLETE",
      "Tài khoản Google không chia sẻ đủ thông tin để đăng nhập.",
      400,
    );
  }
  return {
    sub: info.sub,
    email: info.email,
    // userinfo trả boolean; token id trả chuỗi "true" — chấp nhận cả hai.
    emailVerified: info.email_verified === true || info.email_verified === "true",
    name: (info.name ?? info.given_name ?? "").trim(),
    avatarUrl: (info.picture ?? "").trim().slice(0, 500),
  };
}

function resolveFullName(profile: GoogleProfile, email: string): string {
  const raw = profile.name.trim();
  if (raw.length >= 2) return raw.slice(0, 100);
  const local = email.split("@")[0] ?? "";
  return (local.length >= 2 ? local : "Người dùng Google").slice(0, 100);
}

function assertUsable(status: CurrentUser["status"]): void {
  if (status === "LOCKED" || status === "DISABLED") {
    throw new AppError(
      "ACCOUNT_UNAVAILABLE",
      "Tài khoản đang bị khóa. Vui lòng liên hệ hỗ trợ.",
      403,
    );
  }
}

/**
 * Tìm hoặc tạo người dùng từ hồ sơ Google, đồng thời gắn identity GOOGLE.
 * Thứ tự đối chiếu: identity (provider+sub) → email đã tồn tại (liên kết thêm)
 * → tạo tài khoản mới đã kích hoạt (Google đã xác thực email).
 */
export async function findOrCreateGoogleUser(
  db: Database,
  emailService: EmailService,
  config: AppConfig,
  request: FastifyRequest,
  profile: GoogleProfile,
): Promise<{ userId: string; isNew: boolean }> {
  if (!profile.emailVerified) {
    throw new AppError(
      "GOOGLE_EMAIL_UNVERIFIED",
      "Email Google chưa được xác thực nên không thể dùng để đăng nhập.",
      403,
    );
  }
  const email = normalizeEmail(profile.email);
  const fullName = resolveFullName(profile, email);

  // 1) Đã từng đăng nhập bằng chính tài khoản Google này.
  const byIdentity = await query<{ id: string; status: CurrentUser["status"] }>(
    db,
    `
      SELECT u.id, u.status
      FROM auth_identities ai
      JOIN users u ON u.id = ai.user_id
      WHERE ai.provider = $1 AND ai.provider_subject = $2
      LIMIT 1
    `,
    [PROVIDER, profile.sub],
  );
  if (byIdentity.rows[0]) {
    const user = byIdentity.rows[0];
    assertUsable(user.status);
    await query(
      db,
      `
        UPDATE users
        SET status = CASE WHEN status = 'PENDING_EMAIL' THEN 'ACTIVE' ELSE status END,
          email_verified_at = COALESCE(email_verified_at, now()),
          avatar_url = COALESCE(NULLIF($2, ''), avatar_url),
          last_login_at = now()
        WHERE id = $1
      `,
      [user.id, profile.avatarUrl],
    );
    return { userId: user.id, isNew: false };
  }

  const result = await withTransaction(db, async (client) => {
    const existing = await query<{ id: string; status: CurrentUser["status"] }>(
      client,
      "SELECT id, status FROM users WHERE lower(email) = $1 FOR UPDATE",
      [email],
    );
    const current = existing.rows[0];

    // 2) Email đã có tài khoản (đăng ký bằng mật khẩu trước đó) → liên kết thêm
    // Google. An toàn vì Google đã xác thực chính email này.
    if (current) {
      assertUsable(current.status);
      await query(
        client,
        `
          INSERT INTO auth_identities (user_id, provider, provider_subject)
          VALUES ($1, $2, $3)
          ON CONFLICT (provider, provider_subject) DO NOTHING
        `,
        [current.id, PROVIDER, profile.sub],
      );
      await query(
        client,
        `
          UPDATE users
          SET status = CASE WHEN status = 'PENDING_EMAIL' THEN 'ACTIVE' ELSE status END,
            email_verified_at = COALESCE(email_verified_at, now()),
            avatar_url = COALESCE(NULLIF($2, ''), avatar_url),
            last_login_at = now()
          WHERE id = $1
        `,
        [current.id, profile.avatarUrl],
      );
      return { userId: current.id, isNew: false };
    }

    // 3) Tạo tài khoản mới đã kích hoạt sẵn.
    let referralCode = randomReferralCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const duplicate = await query(
        client,
        "SELECT 1 FROM users WHERE referral_code = $1",
        [referralCode],
      );
      if (!duplicate.rowCount) break;
      referralCode = randomReferralCode();
    }

    const inserted = await query<{ id: string }>(
      client,
      `
        INSERT INTO users (
          email, full_name, password_hash, status, email_verified_at,
          referral_code, avatar_url, last_login_at
        ) VALUES ($1, $2, NULL, 'ACTIVE', now(), $3, $4, now())
        RETURNING id
      `,
      [email, fullName, referralCode, profile.avatarUrl],
    );
    const userId = inserted.rows[0]!.id;
    await query(
      client,
      `
        INSERT INTO auth_identities (user_id, provider, provider_subject)
        VALUES ($1, $2, $3)
      `,
      [userId, PROVIDER, profile.sub],
    );
    await query(
      client,
      `
        INSERT INTO user_consents (
          user_id, terms_version, privacy_version, ip_hash
        ) VALUES ($1, $2, $3, $4)
      `,
      [
        userId,
        config.TERMS_VERSION,
        config.PRIVACY_VERSION,
        hashSensitiveValue(request.ip, config),
      ],
    );
    return { userId, isNew: true };
  });

  // Gửi bộ chính sách người dùng cho tài khoản mới, không để lỗi thư chặn đăng nhập.
  if (result.isNew) {
    try {
      const facts = await loadUserPolicyFacts(db, config);
      await emailService.sendUserPolicy({ to: email, fullName, facts });
    } catch (error) {
      console.error("Không gửi được email chính sách người dùng (Google)", error);
    }
  }

  return result;
}
