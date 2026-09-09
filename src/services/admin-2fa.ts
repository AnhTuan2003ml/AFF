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

/** Xác nhận bật 2FA bằng một mã hợp lệ từ app Authenticator. */
export async function confirmEnroll(
  db: Database,
  config: AppConfig,
  userId: string,
  token: string,
): Promise<void> {
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
}

/** Tắt 2FA (yêu cầu mã hợp lệ ở tầng route). Xóa luôn secret. */
export async function disable2fa(db: Database, userId: string): Promise<void> {
  await query(
    db,
    `UPDATE users
     SET totp_enabled = false, totp_secret = NULL, totp_enabled_at = NULL
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
