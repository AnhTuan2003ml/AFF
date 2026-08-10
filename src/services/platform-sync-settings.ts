import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { decryptField, encryptField } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { extractShopeeCookie } from "./shopee-report.js";

export interface PlatformSyncSettings {
  shopeeEnabled: boolean;
  shopeeCookieHint: string | null;
  shopeeCookieUpdatedAt: Date | null;
  shopeeHasCookie: boolean;
  shopeeIntervalMinutes: number;
  shopeeLookbackDays: number;
  shopeeLastRunAt: Date | null;
  shopeeLastSuccessAt: Date | null;
  shopeeLastStatus: string | null;
  shopeeLastError: string | null;
  shopeeLastFetchedCount: number;
  shopeeLastImportedCount: number;
  shopeeLastFailedCount: number;
  updatedAt: Date;
}

interface SettingsRow {
  shopee_enabled: boolean;
  shopee_cookie_ciphertext: string | null;
  shopee_cookie_hint: string | null;
  shopee_cookie_updated_at: Date | null;
  shopee_interval_minutes: number;
  shopee_lookback_days: number;
  shopee_last_run_at: Date | null;
  shopee_last_success_at: Date | null;
  shopee_last_status: string | null;
  shopee_last_error: string | null;
  shopee_last_fetched_count: number;
  shopee_last_imported_count: number;
  shopee_last_failed_count: number;
  updated_at: Date;
}

const SELECT_SQL = `
  SELECT shopee_enabled, shopee_cookie_ciphertext, shopee_cookie_hint,
    shopee_cookie_updated_at, shopee_interval_minutes, shopee_lookback_days,
    shopee_last_run_at, shopee_last_success_at, shopee_last_status,
    shopee_last_error, shopee_last_fetched_count, shopee_last_imported_count,
    shopee_last_failed_count, updated_at
  FROM platform_sync_settings
  WHERE id = true
`;

function mapRow(row: SettingsRow): PlatformSyncSettings {
  return {
    shopeeEnabled: row.shopee_enabled,
    shopeeCookieHint: row.shopee_cookie_hint,
    shopeeCookieUpdatedAt: row.shopee_cookie_updated_at,
    shopeeHasCookie: Boolean(row.shopee_cookie_ciphertext),
    shopeeIntervalMinutes: row.shopee_interval_minutes,
    shopeeLookbackDays: row.shopee_lookback_days,
    shopeeLastRunAt: row.shopee_last_run_at,
    shopeeLastSuccessAt: row.shopee_last_success_at,
    shopeeLastStatus: row.shopee_last_status,
    shopeeLastError: row.shopee_last_error,
    shopeeLastFetchedCount: row.shopee_last_fetched_count,
    shopeeLastImportedCount: row.shopee_last_imported_count,
    shopeeLastFailedCount: row.shopee_last_failed_count,
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
  const result = await query<{ shopee_cookie_ciphertext: string | null }>(
    db,
    "SELECT shopee_cookie_ciphertext FROM platform_sync_settings WHERE id = true",
  );
  const ciphertext = result.rows[0]?.shopee_cookie_ciphertext;
  if (!ciphertext) return null;
  try {
    return decryptField(ciphertext, config);
  } catch {
    throw new AppError(
      "SHOPEE_COOKIE_UNREADABLE",
      "Không giải mã được cookie Shopee đã lưu. Hãy nhập lại cookie trong trang đồng bộ.",
      500,
    );
  }
}

export interface PlatformSyncSettingsPatch {
  shopeeEnabled: boolean;
  shopeeIntervalMinutes: number;
  shopeeLookbackDays: number;
  /** Bỏ trống nghĩa là giữ nguyên cookie cũ. */
  shopeeCookie?: string;
  clearShopeeCookie?: boolean;
}

function cookieHint(cookie: string): string {
  const sessionId = cookie.match(/SPC_(?:EC|ST|F)=([^;]+)/)?.[1] ?? cookie;
  const tail = sessionId.replace(/\s/g, "").slice(-6);
  return `•••${tail}`;
}

export async function updatePlatformSyncSettings(
  db: Database,
  config: AppConfig,
  patch: PlatformSyncSettingsPatch,
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

  await getPlatformSyncSettings(db);
  const cookie = patch.shopeeCookie?.trim()
    ? extractShopeeCookie(patch.shopeeCookie)
    : null;
  if (patch.shopeeEnabled && !cookie) {
    const current = await getPlatformSyncSettings(db);
    if (!current.shopeeHasCookie || patch.clearShopeeCookie) {
      throw new AppError(
        "SHOPEE_COOKIE_REQUIRED",
        "Hãy nhập cookie Shopee trước khi bật đồng bộ tự động.",
      );
    }
  }

  const updated = await query<SettingsRow>(
    db,
    `
      UPDATE platform_sync_settings SET
        shopee_enabled = $1,
        shopee_interval_minutes = $2,
        shopee_lookback_days = $3,
        shopee_cookie_ciphertext = CASE
          WHEN $5 THEN NULL
          WHEN $4::text IS NOT NULL THEN $4
          ELSE shopee_cookie_ciphertext
        END,
        shopee_cookie_hint = CASE
          WHEN $5 THEN NULL
          WHEN $4::text IS NOT NULL THEN $6
          ELSE shopee_cookie_hint
        END,
        shopee_cookie_updated_at = CASE
          WHEN $5 THEN NULL
          WHEN $4::text IS NOT NULL THEN now()
          ELSE shopee_cookie_updated_at
        END,
        updated_by = $7,
        updated_at = now()
      WHERE id = true
      RETURNING shopee_enabled, shopee_cookie_ciphertext, shopee_cookie_hint,
        shopee_cookie_updated_at, shopee_interval_minutes, shopee_lookback_days,
        shopee_last_run_at, shopee_last_success_at, shopee_last_status,
        shopee_last_error, shopee_last_fetched_count,
        shopee_last_imported_count, shopee_last_failed_count, updated_at
    `,
    [
      patch.shopeeEnabled,
      patch.shopeeIntervalMinutes,
      patch.shopeeLookbackDays,
      cookie ? encryptField(cookie, config) : null,
      Boolean(patch.clearShopeeCookie),
      cookie ? cookieHint(cookie) : null,
      actorId,
    ],
  );
  return mapRow(updated.rows[0]!);
}

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
