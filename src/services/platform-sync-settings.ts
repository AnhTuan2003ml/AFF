import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { decryptField, encryptField } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { extractShopeeCookie } from "./shopee-report.js";

export type CookieSource = "MANUAL" | "PROFILE";
export type SyncPlatform = "SHOPEE" | "LAZADA";

export interface PlatformSyncSettings {
  shopeeEnabled: boolean;
  shopeeCookieHint: string | null;
  shopeeCookieUpdatedAt: Date | null;
  shopeeHasCookie: boolean;
  shopeeCookieSource: CookieSource;
  shopeeIntervalMinutes: number;
  shopeeLookbackDays: number;
  shopeeLastRunAt: Date | null;
  shopeeLastSuccessAt: Date | null;
  shopeeLastStatus: string | null;
  shopeeLastError: string | null;
  shopeeLastFetchedCount: number;
  shopeeLastImportedCount: number;
  shopeeLastFailedCount: number;
  lazadaCookieHint: string | null;
  lazadaCookieUpdatedAt: Date | null;
  lazadaHasCookie: boolean;
  lazadaCookieSource: CookieSource;
  updatedAt: Date;
}

interface SettingsRow {
  shopee_enabled: boolean;
  shopee_cookie_ciphertext: string | null;
  shopee_cookie_hint: string | null;
  shopee_cookie_updated_at: Date | null;
  shopee_cookie_source: CookieSource;
  shopee_interval_minutes: number;
  shopee_lookback_days: number;
  shopee_last_run_at: Date | null;
  shopee_last_success_at: Date | null;
  shopee_last_status: string | null;
  shopee_last_error: string | null;
  shopee_last_fetched_count: number;
  shopee_last_imported_count: number;
  shopee_last_failed_count: number;
  lazada_cookie_ciphertext: string | null;
  lazada_cookie_hint: string | null;
  lazada_cookie_updated_at: Date | null;
  lazada_cookie_source: CookieSource;
  updated_at: Date;
}

const SELECT_SQL = `
  SELECT shopee_enabled, shopee_cookie_ciphertext, shopee_cookie_hint,
    shopee_cookie_updated_at, shopee_cookie_source, shopee_interval_minutes,
    shopee_lookback_days, shopee_last_run_at, shopee_last_success_at,
    shopee_last_status, shopee_last_error, shopee_last_fetched_count,
    shopee_last_imported_count, shopee_last_failed_count,
    lazada_cookie_ciphertext, lazada_cookie_hint, lazada_cookie_updated_at,
    lazada_cookie_source, updated_at
  FROM platform_sync_settings
  WHERE id = true
`;

function mapRow(row: SettingsRow): PlatformSyncSettings {
  return {
    shopeeEnabled: row.shopee_enabled,
    shopeeCookieHint: row.shopee_cookie_hint,
    shopeeCookieUpdatedAt: row.shopee_cookie_updated_at,
    shopeeHasCookie: Boolean(row.shopee_cookie_ciphertext),
    shopeeCookieSource: row.shopee_cookie_source,
    shopeeIntervalMinutes: row.shopee_interval_minutes,
    shopeeLookbackDays: row.shopee_lookback_days,
    shopeeLastRunAt: row.shopee_last_run_at,
    shopeeLastSuccessAt: row.shopee_last_success_at,
    shopeeLastStatus: row.shopee_last_status,
    shopeeLastError: row.shopee_last_error,
    shopeeLastFetchedCount: row.shopee_last_fetched_count,
    shopeeLastImportedCount: row.shopee_last_imported_count,
    shopeeLastFailedCount: row.shopee_last_failed_count,
    lazadaCookieHint: row.lazada_cookie_hint,
    lazadaCookieUpdatedAt: row.lazada_cookie_updated_at,
    lazadaHasCookie: Boolean(row.lazada_cookie_ciphertext),
    lazadaCookieSource: row.lazada_cookie_source,
    updatedAt: row.updated_at,
  };
}

export async function getPlatformSyncSettings(
  db: Database,
): Promise<PlatformSyncSettings> {
  const existing = await query<SettingsRow>(db, SELECT_SQL);
  if (existing.rows[0]) return mapRow(existing.rows[0]);

  await query(
    db,
    `
      INSERT INTO platform_sync_settings (id) VALUES (true)
      ON CONFLICT (id) DO NOTHING
    `,
  );
  const seeded = await query<SettingsRow>(db, SELECT_SQL);
  return mapRow(seeded.rows[0]!);
}

/**
 * Lấy cookie Shopee đã giải mã. Chỉ dùng trong tiến trình đồng bộ — không bao
 * giờ trả về giao diện hay ghi log.
 */
export async function getShopeeCookie(
  db: Database,
  config: AppConfig,
): Promise<string | null> {
  return getPlatformCookie(db, config, "SHOPEE");
}

/** Cookie Lazada (adsense.lazada.vn) đã giải mã — cho luồng sinh link server-side. */
export async function getLazadaCookie(
  db: Database,
  config: AppConfig,
): Promise<string | null> {
  return getPlatformCookie(db, config, "LAZADA");
}

async function getPlatformCookie(
  db: Database,
  config: AppConfig,
  platform: SyncPlatform,
): Promise<string | null> {
  const column =
    platform === "SHOPEE"
      ? "shopee_cookie_ciphertext"
      : "lazada_cookie_ciphertext";
  const result = await query<Record<string, string | null>>(
    db,
    `SELECT ${column} FROM platform_sync_settings WHERE id = true`,
  );
  const ciphertext = result.rows[0]?.[column];
  if (!ciphertext) return null;
  try {
    return decryptField(ciphertext, config);
  } catch {
    throw new AppError(
      "COOKIE_UNREADABLE",
      `Không giải mã được cookie ${platform === "SHOPEE" ? "Shopee" : "Lazada"} đã lưu. Hãy lấy lại từ profile hoặc dán lại.`,
      500,
    );
  }
}

export interface ShopeeSchedulePatch {
  shopeeEnabled: boolean;
  shopeeIntervalMinutes: number;
  shopeeLookbackDays: number;
}

/** Lưu lịch đồng bộ Shopee (bật/tắt, tần suất, phạm vi truy hồi) — không đụng cookie. */
export async function updateShopeeSyncSchedule(
  db: Database,
  patch: ShopeeSchedulePatch,
  actorId: string,
): Promise<PlatformSyncSettings> {
  if (
    !Number.isInteger(patch.shopeeIntervalMinutes) ||
    patch.shopeeIntervalMinutes < 5 ||
    patch.shopeeIntervalMinutes > 1440
  ) {
    throw new AppError(
      "INVALID_SYNC_CONFIG",
      "Tần suất đồng bộ phải từ 5 đến 1440 phút.",
    );
  }
  if (
    !Number.isInteger(patch.shopeeLookbackDays) ||
    patch.shopeeLookbackDays < 1 ||
    patch.shopeeLookbackDays > 180
  ) {
    throw new AppError(
      "INVALID_SYNC_CONFIG",
      "Khoảng thời gian truy hồi phải từ 1 đến 180 ngày.",
    );
  }
  const current = await getPlatformSyncSettings(db);
  if (patch.shopeeEnabled && !current.shopeeHasCookie) {
    throw new AppError(
      "SHOPEE_COOKIE_REQUIRED",
      "Hãy nạp cookie Shopee (dán tay hoặc lấy từ profile) trước khi bật đồng bộ tự động.",
    );
  }

  const updated = await query<SettingsRow>(
    db,
    `
      UPDATE platform_sync_settings SET
        shopee_enabled = $1,
        shopee_interval_minutes = $2,
        shopee_lookback_days = $3,
        updated_by = $4,
        updated_at = now()
      WHERE id = true
      RETURNING ${RETURNING_COLUMNS}
    `,
    [
      patch.shopeeEnabled,
      patch.shopeeIntervalMinutes,
      patch.shopeeLookbackDays,
      actorId,
    ],
  );
  return mapRow(updated.rows[0]!);
}

function cookieHint(cookie: string, platform: SyncPlatform): string {
  const pattern =
    platform === "SHOPEE"
      ? /SPC_(?:EC|ST|F)=([^;]+)/
      : /(?:lzd_sid|_m_h5_tk|lwrid)=([^;]+)/;
  const token = cookie.match(pattern)?.[1] ?? cookie;
  const tail = token.replace(/\s/g, "").slice(-6);
  return `•••${tail}`;
}

/**
 * Nạp cookie cho một sàn từ chuỗi thô (dán tay hoặc lấy từ profile) và ghi lại
 * nguồn (`source`). Cookie mã hóa AES-256-GCM trước khi lưu.
 */
export async function setPlatformCookie(
  db: Database,
  config: AppConfig,
  input: { platform: SyncPlatform; cookie: string; source: CookieSource },
  actorId: string,
): Promise<PlatformSyncSettings> {
  await getPlatformSyncSettings(db);
  const normalized =
    input.platform === "SHOPEE"
      ? extractShopeeCookie(input.cookie)
      : input.cookie.trim();
  if (!normalized) {
    throw new AppError(
      "COOKIE_EMPTY",
      `Không đọc được cookie ${input.platform === "SHOPEE" ? "Shopee" : "Lazada"} hợp lệ từ nội dung đã nhập.`,
    );
  }
  const prefix = input.platform === "SHOPEE" ? "shopee" : "lazada";
  const updated = await query<SettingsRow>(
    db,
    `
      UPDATE platform_sync_settings SET
        ${prefix}_cookie_ciphertext = $1,
        ${prefix}_cookie_hint = $2,
        ${prefix}_cookie_updated_at = now(),
        ${prefix}_cookie_source = $3,
        updated_by = $4,
        updated_at = now()
      WHERE id = true
      RETURNING ${RETURNING_COLUMNS}
    `,
    [
      encryptField(normalized, config),
      cookieHint(normalized, input.platform),
      input.source,
      actorId,
    ],
  );
  return mapRow(updated.rows[0]!);
}

/** Xóa cookie đang lưu của một sàn. */
export async function clearPlatformCookie(
  db: Database,
  platform: SyncPlatform,
  actorId: string,
): Promise<PlatformSyncSettings> {
  const prefix = platform === "SHOPEE" ? "shopee" : "lazada";
  const updated = await query<SettingsRow>(
    db,
    `
      UPDATE platform_sync_settings SET
        ${prefix}_cookie_ciphertext = NULL,
        ${prefix}_cookie_hint = NULL,
        ${prefix}_cookie_updated_at = NULL,
        ${prefix === "shopee" ? "shopee_enabled = false," : ""}
        updated_by = $1,
        updated_at = now()
      WHERE id = true
      RETURNING ${RETURNING_COLUMNS}
    `,
    [actorId],
  );
  return mapRow(updated.rows[0]!);
}

const RETURNING_COLUMNS = `shopee_enabled, shopee_cookie_ciphertext,
  shopee_cookie_hint, shopee_cookie_updated_at, shopee_cookie_source,
  shopee_interval_minutes, shopee_lookback_days, shopee_last_run_at,
  shopee_last_success_at, shopee_last_status, shopee_last_error,
  shopee_last_fetched_count, shopee_last_imported_count,
  shopee_last_failed_count, lazada_cookie_ciphertext, lazada_cookie_hint,
  lazada_cookie_updated_at, lazada_cookie_source, updated_at`;

export interface SyncRunOutcome {
  status: "SUCCESS" | "PARTIAL" | "ERROR";
  fetched: number;
  imported: number;
  failed: number;
  error?: string;
}

export async function recordShopeeSyncRun(
  db: Database,
  outcome: SyncRunOutcome,
): Promise<void> {
  await query(
    db,
    `
      UPDATE platform_sync_settings SET
        shopee_last_run_at = now(),
        shopee_last_success_at = CASE
          WHEN $1 = 'ERROR' THEN shopee_last_success_at ELSE now()
        END,
        shopee_last_status = $1,
        shopee_last_error = NULLIF($2, ''),
        shopee_last_fetched_count = $3,
        shopee_last_imported_count = $4,
        shopee_last_failed_count = $5
      WHERE id = true
    `,
    [
      outcome.status,
      (outcome.error ?? "").slice(0, 500),
      outcome.fetched,
      outcome.imported,
      outcome.failed,
    ],
  );
}
