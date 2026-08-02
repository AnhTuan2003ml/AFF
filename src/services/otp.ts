import type { AppConfig } from "../config.js";
import { query, type Database, withTransaction } from "../db.js";
import {
  keyedHash,
  normalizeEmail,
  randomOtp,
  safeStringEqual,
} from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import type { EmailService } from "./email.js";

interface OtpRow {
  id: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
}

function otpHash(
  email: string,
  purpose: string,
  code: string,
  config: AppConfig,
): string {
  return keyedHash(`${normalizeEmail(email)}:${purpose}:${code}`, config.OTP_PEPPER);
}

function purposeLabel(purpose: string): string {
  if (purpose === "REGISTER") return "đăng ký tài khoản";
  if (purpose === "RESET_PASSWORD") return "đặt lại mật khẩu";
  if (purpose.startsWith("BANK_CHANGE:")) return "thêm tài khoản ngân hàng";
  if (purpose.startsWith("WITHDRAWAL:")) return "yêu cầu rút tiền";
  return "thao tác bảo mật";
}

export async function issueOtp(
  db: Database,
  emailService: EmailService,
  config: AppConfig,
  emailInput: string,
  purpose: string,
): Promise<void> {
  const email = normalizeEmail(emailInput);
  const recent = await query<{ count: string }>(
    db,
    `
      SELECT count(*)::text AS count
      FROM otp_challenges
      WHERE lower(email) = $1
        AND created_at > now() - interval '1 hour'
    `,
    [email],
  );
  if (Number(recent.rows[0]?.count ?? 0) >= config.OTP_MAX_SENDS_PER_HOUR) {
    throw new AppError(
      "OTP_RATE_LIMITED",
      "Bạn đã yêu cầu quá nhiều mã. Hãy thử lại sau 60 phút.",
      429,
    );
  }

  const code = randomOtp();
  const created = await withTransaction(db, async (client) => {
    await query(
      client,
      `
        UPDATE otp_challenges
        SET consumed_at = now()
        WHERE lower(email) = $1
          AND purpose = $2
          AND consumed_at IS NULL
      `,
      [email, purpose],
    );
    return query<{ id: string }>(
      client,
      `
        INSERT INTO otp_challenges (
          email, purpose, code_hash, max_attempts, expires_at
        ) VALUES (
          $1, $2, $3, $4, now() + ($5 * interval '1 minute')
        )
        RETURNING id
      `,
      [
        email,
        purpose,
        otpHash(email, purpose, code, config),
        config.OTP_MAX_ATTEMPTS,
        config.OTP_TTL_MINUTES,
      ],
    );
  });

  try {
    await emailService.sendOtp({
      to: email,
      code,
      purposeLabel: purposeLabel(purpose),
      expiresInMinutes: config.OTP_TTL_MINUTES,
    });
  } catch (error) {
    const id = created.rows[0]?.id;
    if (id) {
      await query(
        db,
        "DELETE FROM otp_challenges WHERE id = $1",
        [id],
      ).catch(() => undefined);
    }
    console.error(
      "[SMTP] Không gửi được email OTP:",
      error instanceof Error ? error.message : "Lỗi SMTP không xác định",
    );
    throw new AppError(
      "EMAIL_SEND_FAILED",
      "Chưa gửi được mã OTP tới email này. Vui lòng kiểm tra địa chỉ email hoặc cấu hình SMTP rồi thử lại.",
      503,
    );
  }
}

export async function verifyOtp(
  db: Database,
  config: AppConfig,
  emailInput: string,
  purpose: string,
  codeInput: string,
): Promise<void> {
  const email = normalizeEmail(emailInput);
  const code = codeInput.trim();

  const verified = await withTransaction(db, async (client) => {
    const result = await query<OtpRow>(
      client,
      `
        SELECT id, code_hash, attempts, max_attempts, expires_at, consumed_at
        FROM otp_challenges
        WHERE lower(email) = $1 AND purpose = $2
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [email, purpose],
    );
    const challenge = result.rows[0];
    if (
      !challenge ||
      challenge.consumed_at ||
      challenge.expires_at.getTime() <= Date.now() ||
      challenge.attempts >= challenge.max_attempts
    ) {
      throw new AppError(
        "OTP_INVALID",
        "Mã xác nhận không hợp lệ hoặc đã hết hạn.",
        400,
      );
    }

    const actualHash = otpHash(email, purpose, code, config);
    if (!safeStringEqual(actualHash, challenge.code_hash)) {
      await query(
        client,
        "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1",
        [challenge.id],
      );
      return false;
    }

    await query(
      client,
      "UPDATE otp_challenges SET consumed_at = now() WHERE id = $1",
      [challenge.id],
    );
    return true;
  });
  if (!verified) {
    throw new AppError(
      "OTP_INVALID",
      "Mã xác nhận không đúng. Hãy kiểm tra và thử lại.",
      400,
    );
  }
}
