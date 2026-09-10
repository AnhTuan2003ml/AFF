import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database, withTransaction } from "../db.js";
import {
  hashSensitiveValue,
  normalizeEmail,
  randomReferralCode,
} from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { CurrentUser } from "../types/fastify.js";
import { revokeAllUserSessions } from "../auth/session.js";
import type { EmailService } from "./email.js";
import { issueOtp, verifyOtp } from "./otp.js";
import { resolveReferrerByCode } from "./referral-code.js";
import { loadUserPolicyFacts } from "./user-policy.js";

interface UserAuthRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string | null;
  status: CurrentUser["status"];
  role: CurrentUser["role"];
  referral_code: string;
  avatar_url: string;
  gender?: CurrentUser["gender"];
  failed_login_count?: number | null;
  login_locked_until?: Date | string | null;
}

// Khóa tạm sau nhiều lần sai liên tiếp — chống dò mật khẩu.
const LOGIN_MAX_FAILED = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=1,t=3$b+LVY5fwUuBVmpq9m+H1fA$3R5LXrwI6U+BxL4KCybFJWg0kZl9icYX8WAPhAP8na0";

export async function registerWithEmail(
  db: Database,
  emailService: EmailService,
  config: AppConfig,
  params: {
    email: string;
    fullName: string;
    password: string;
    referralCode?: string;
    gender?: "MALE" | "FEMALE" | "UNKNOWN" | undefined;
  },
): Promise<void> {
  const email = normalizeEmail(params.email);
  const passwordHash = await hashPassword(params.password);
  const gender = params.gender ?? "UNKNOWN";

  await withTransaction(db, async (client) => {
    const existing = await query<UserAuthRow>(
      client,
      `
        SELECT id, email, full_name, password_hash, status, role, referral_code
        FROM users WHERE lower(email) = $1 FOR UPDATE
      `,
      [email],
    );
    const current = existing.rows[0];
    if (current?.status === "ACTIVE") {
      throw new AppError(
        "EMAIL_ALREADY_REGISTERED",
        "Email này đã có tài khoản. Hãy đăng nhập hoặc dùng quên mật khẩu.",
        409,
      );
    }
    if (current && ["LOCKED", "DISABLED"].includes(current.status)) {
      throw new AppError(
        "ACCOUNT_UNAVAILABLE",
        "Tài khoản chưa thể đăng ký lại. Vui lòng liên hệ hỗ trợ.",
        403,
      );
    }

    let referredBy: string | null = null;
    if (params.referralCode?.trim()) {
      referredBy = await resolveReferrerByCode(client, params.referralCode);
      // Nhập mã nhưng không khớp ai → CẢNH BÁO để nhập lại (thay vì lặng lẽ bỏ
      // qua). Bỏ trống thì không kiểm tra (mã giới thiệu không bắt buộc).
      if (!referredBy) {
        throw new AppError(
          "REFERRAL_CODE_NOT_FOUND",
          "Mã giới thiệu không tồn tại. Hãy kiểm tra lại hoặc để trống nếu không có.",
          400,
        );
      }
    }

    if (current) {
      await query(
        client,
        `
          UPDATE users
          SET full_name = $2, password_hash = $3,
            referred_by_user_id = COALESCE(referred_by_user_id, $4),
            gender = $5
          WHERE id = $1
        `,
        [current.id, params.fullName.trim(), passwordHash, referredBy, gender],
      );
      return;
    }

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
          email, full_name, password_hash, referral_code, referred_by_user_id,
          gender
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        email,
        params.fullName.trim(),
        passwordHash,
        referralCode,
        referredBy,
        gender,
      ],
    );
    const userId = inserted.rows[0]!.id;
    await query(
      client,
      `
        INSERT INTO auth_identities (user_id, provider, provider_subject)
        VALUES ($1, 'EMAIL', $2)
      `,
      [userId, email],
    );
    if (referredBy) {
      await query(
        client,
        `
          INSERT INTO referrals (referrer_user_id, referred_user_id)
          VALUES ($1, $2)
          ON CONFLICT (referred_user_id) DO NOTHING
        `,
        [referredBy, userId],
      );
    }
  });

  await issueOtp(db, emailService, config, email, "REGISTER");

  // Bộ chính sách người dùng đi kèm ngay lượt đăng ký. Gửi sau OTP và không để
  // lỗi gửi thư làm hỏng đăng ký — người dùng vẫn xem được tại /chinh-sach-nguoi-dung.
  try {
    const facts = await loadUserPolicyFacts(db, config);
    await emailService.sendUserPolicy({
      to: email,
      fullName: params.fullName,
      facts,
    });
  } catch (error) {
    console.error("Không gửi được email chính sách người dùng", error);
  }
}

export async function verifyRegistration(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  emailInput: string,
  code: string,
): Promise<string> {
  const email = normalizeEmail(emailInput);
  await verifyOtp(db, config, email, "REGISTER", code);

  return withTransaction(db, async (client) => {
    const activated = await query<{ id: string }>(
      client,
      `
        UPDATE users
        SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, now())
        WHERE lower(email) = $1
          AND status = 'PENDING_EMAIL'
        RETURNING id
      `,
      [email],
    );
    const userId = activated.rows[0]?.id;
    if (!userId) {
      throw new AppError(
        "REGISTRATION_NOT_FOUND",
        "Không tìm thấy đăng ký đang chờ xác nhận.",
      );
    }
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
    return userId;
  });
}

export async function authenticateWithEmail(
  db: Database,
  emailInput: string,
  password: string,
): Promise<CurrentUser> {
  const email = normalizeEmail(emailInput);
  const result = await query<UserAuthRow>(
    db,
    `
      SELECT id, email, full_name, password_hash, status, role, referral_code,
        avatar_url, gender, failed_login_count, login_locked_until
      FROM users WHERE lower(email) = $1 LIMIT 1
    `,
    [email],
  );
  const user = result.rows[0];

  // Đang trong thời gian khóa tạm → chặn ngay, kể cả mật khẩu đúng.
  const lockedUntil = user?.login_locked_until
    ? new Date(user.login_locked_until)
    : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(
      1,
      Math.ceil((lockedUntil.getTime() - Date.now()) / 60000),
    );
    throw new AppError(
      "ACCOUNT_TEMP_LOCKED",
      `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau ${minutes} phút hoặc đặt lại mật khẩu.`,
      429,
    );
  }

  const passwordMatches = await verifyPassword(
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
    password,
  );
  const valid = Boolean(
    user && user.password_hash && user.status === "ACTIVE" && passwordMatches,
  );

  if (!user || !valid) {
    // Chỉ đếm cho tài khoản có thật & đang hoạt động (không lộ email tồn tại).
    if (user && user.status === "ACTIVE") {
      const nextCount = (user.failed_login_count ?? 0) + 1;
      if (nextCount >= LOGIN_MAX_FAILED) {
        await query(
          db,
          "UPDATE users SET failed_login_count = 0, login_locked_until = $2 WHERE id = $1",
          [user.id, new Date(Date.now() + LOGIN_LOCK_MS)],
        );
      } else {
        await query(
          db,
          "UPDATE users SET failed_login_count = $2 WHERE id = $1",
          [user.id, nextCount],
        );
      }
    }
    throw new AppError(
      "INVALID_CREDENTIALS",
      "Email hoặc mật khẩu không đúng.",
      401,
    );
  }

  // Đăng nhập đúng → reset bộ đếm & mở khóa.
  await query(
    db,
    "UPDATE users SET last_login_at = now(), failed_login_count = 0, login_locked_until = NULL WHERE id = $1",
    [user.id],
  );
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    status: user.status,
    referralCode: user.referral_code,
    avatarUrl: user.avatar_url,
    gender: user.gender ?? "UNKNOWN",
  };
}

export async function requestPasswordReset(
  db: Database,
  emailService: EmailService,
  config: AppConfig,
  emailInput: string,
): Promise<void> {
  const email = normalizeEmail(emailInput);
  const result = await query<{ exists: boolean }>(
    db,
    `
      SELECT EXISTS(
        SELECT 1 FROM users
        WHERE lower(email) = $1 AND status = 'ACTIVE'
      ) AS exists
    `,
    [email],
  );
  if (result.rows[0]?.exists) {
    await issueOtp(db, emailService, config, email, "RESET_PASSWORD");
  }
}

export async function resetPassword(
  db: Database,
  config: AppConfig,
  params: { email: string; code: string; password: string },
): Promise<void> {
  const email = normalizeEmail(params.email);
  await verifyOtp(db, config, email, "RESET_PASSWORD", params.code);
  const passwordHash = await hashPassword(params.password);
  const updated = await query<{ id: string }>(
    db,
    `
      UPDATE users
      SET password_hash = $2, password_changed_at = now()
      WHERE lower(email) = $1 AND status = 'ACTIVE'
      RETURNING id
    `,
    [email, passwordHash],
  );
  const userId = updated.rows[0]?.id;
  if (!userId) {
    throw new AppError(
      "RESET_NOT_AVAILABLE",
      "Không thể đặt lại mật khẩu cho tài khoản này.",
    );
  }
  await revokeAllUserSessions(db, userId);
}
