import { createHash, randomBytes } from "node:crypto";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { decryptField, encryptField } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import {
  formatSecretForDisplay,
  generateTotpSecret,
  totpKeyUri,
  verifyTotp,
} from "../lib/totp.js";

const ISSUER = "ShopTik Admin";

export interface TwoFactorState {
  enabled: boolean;
  enabledAt: Date | null;
}

export interface EnrollData {
  secret: string;
  formattedSecret: string;
  keyUri: string;
}

async function loadSecret(
  db: Database,
  config: AppConfig,
  userId: string,
): Promise<string | null> {
  const r = await query<{ totp_secret: string | null }>(
    db,
    "SELECT totp_secret FROM users WHERE id = $1",
    [userId],
  );
  const enc = r.rows[0]?.totp_secret;
  if (!enc) return null;
  try {
    return decryptField(enc, config);
  } catch {
    return null;
  }
}

export async function get2faState(
  db: Database,
  userId: string,
): Promise<TwoFactorState> {
  const r = await query<{ totp_enabled: boolean; totp_enabled_at: Date | null }>(
    db,
    "SELECT totp_enabled, totp_enabled_at FROM users WHERE id = $1",
    [userId],
  );
  return {
    enabled: Boolean(r.rows[0]?.totp_enabled),
    enabledAt: r.rows[0]?.totp_enabled_at ?? null,
  };
}

/**
 * Bắt đầu thiết lập 2FA: sinh secret mới, lưu MÃ HÓA (chưa bật), trả secret +
 * URI để hiện QR/nhập tay. Chưa có hiệu lực tới khi confirmEnroll.
 */
export async function startEnroll(
  db: Database,
  config: AppConfig,
  user: { id: string; email: string },
): Promise<EnrollData> {
  const secret = generateTotpSecret();
  await query(
    db,
    "UPDATE users SET totp_secret = $2, totp_enabled = false WHERE id = $1",
    [user.id, encryptField(secret, config)],
  );
  return {
    secret,
    formattedSecret: formatSecretForDisplay(secret),
    keyUri: totpKeyUri(secret, user.email, ISSUER),
  };
}

/**
 * Xác nhận bật 2FA bằng một mã hợp lệ từ app Authenticator. Trả về danh sách
 * mã dự phòng (hiển thị MỘT LẦN) để admin lưu lại.
 */
export async function confirmEnroll(
  db: Database,
  config: AppConfig,
  userId: string,
  token: string,
): Promise<string[]> {
  const secret = await loadSecret(db, config, userId);
  if (!secret) {
    throw new AppError(
      "TWO_FACTOR_NO_SECRET",
      "Chưa bắt đầu thiết lập 2FA. Hãy tải lại trang và quét mã lại.",
      400,
    );
  }
  if (!verifyTotp(secret, token)) {
    throw new AppError(
      "TWO_FACTOR_INVALID",
      "Mã xác thực không đúng. Kiểm tra đồng hồ thiết bị và nhập mã mới nhất.",
      400,
    );
  }
  await query(
    db,
    "UPDATE users SET totp_enabled = true, totp_enabled_at = now() WHERE id = $1",
    [userId],
  );
  return regenerateBackupCodes(db, userId);
}

/** Tắt 2FA (yêu cầu mã hợp lệ ở tầng route). Xóa luôn secret. */
export async function disable2fa(db: Database, userId: string): Promise<void> {
  await query(
    db,
    `UPDATE users
     SET totp_enabled = false, totp_secret = NULL, totp_enabled_at = NULL,
       totp_backup_codes = '{}'
     WHERE id = $1`,
    [userId],
  );
}

/** Xác thực mã TOTP của người dùng (dùng ở bước đăng nhập và lúc tắt 2FA). */
export async function verifyUserTotp(
  db: Database,
  config: AppConfig,
  userId: string,
  token: string,
): Promise<boolean> {
  const secret = await loadSecret(db, config, userId);
  if (!secret) return false;
  return verifyTotp(secret, token);
}

/** Đăng nhập có phải qua bước 2FA không: tài khoản đã bật 2FA. */
export async function requires2fa(
  db: Database,
  userId: string,
): Promise<boolean> {
  const r = await query<{ totp_enabled: boolean }>(
    db,
    "SELECT totp_enabled FROM users WHERE id = $1",
    [userId],
  );
  return Boolean(r.rows[0]?.totp_enabled);
}

/* ----------------------------- Mã dự phòng ----------------------------- */

const BACKUP_CODE_COUNT = 10;

function hashBackupCode(code: string): string {
  return createHash("sha256")
    .update(code.replace(/[^a-z0-9]/gi, "").toLowerCase())
    .digest("hex");
}

/** Sinh 10 mã dự phòng mới, lưu HASH, trả về mã GỐC để hiển thị một lần. */
export async function regenerateBackupCodes(
  db: Database,
  userId: string,
): Promise<string[]> {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
    // 10 ký tự base32 → hiển thị dạng "xxxxx-xxxxx" cho dễ đọc/nhập.
    const raw = randomBytes(7)
      .toString("base64")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(0, 10)
      .padEnd(10, "0");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    hashes.push(hashBackupCode(raw));
  }
  await query(db, "UPDATE users SET totp_backup_codes = $2 WHERE id = $1", [
    userId,
    hashes,
  ]);
  return codes;
}

/** Số mã dự phòng còn lại. */
export async function countBackupCodes(
  db: Database,
  userId: string,
): Promise<number> {
  const r = await query<{ n: string }>(
    db,
    "SELECT coalesce(array_length(totp_backup_codes, 1), 0)::text AS n FROM users WHERE id = $1",
    [userId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Dùng một mã dự phòng: nếu khớp thì gỡ khỏi mảng (dùng một lần) và trả true. */
export async function consumeBackupCode(
  db: Database,
  userId: string,
  code: string,
): Promise<boolean> {
  const hash = hashBackupCode(code);
  const r = await query<{ removed: boolean }>(
    db,
    `UPDATE users
     SET totp_backup_codes = array_remove(totp_backup_codes, $2)
     WHERE id = $1 AND $2 = ANY(totp_backup_codes)
     RETURNING true AS removed`,
    [userId, hash],
  );
  return r.rows.length > 0;
}
