import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { hashSensitiveValue, randomToken, sha256 } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";

/**
 * Phiên đăng nhập cho app di động.
 *
 * Cookie `aff_session` chỉ chạy được trong trình duyệt cùng nguồn, nên app
 * dùng cặp token thay thế — nhưng KHÔNG dựng cơ chế phiên thứ hai: cả hai
 * cùng nằm ở bảng `sessions`.
 *
 *   token_hash          ← access token, sống ngắn (mặc định 30 phút)
 *   refresh_token_hash  ← refresh token, sống dài (mặc định 60 ngày)
 *
 * Nhờ dùng chung cột `token_hash`, hook xác thực trong auth/session.ts chỉ
 * cần đọc thêm header Authorization là mọi guard sẵn có tự động hiểu người
 * dùng app — không phải sửa từng route.
 *
 * Mỗi lần làm mới thì XOAY cả hai token trên cùng một dòng. Hệ quả: refresh
 * token cũ dùng lại lần nữa sẽ không khớp dòng nào và bị từ chối, còn một
 * thiết bị vẫn chỉ chiếm đúng một dòng `sessions`.
 */

export interface MobileTokenPair {
  userId: string;
  tokenType: "Bearer";
  accessToken: string;
  /** Số giây còn lại của access token — app dùng để hẹn giờ làm mới. */
  expiresIn: number;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

function accessLifetimeMs(config: AppConfig): number {
  return config.MOBILE_ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;
}

function refreshLifetimeMs(config: AppConfig): number {
  return config.MOBILE_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function buildPair(config: AppConfig): {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
} {
  return {
    accessToken: randomToken(32),
    refreshToken: randomToken(32),
    accessExpiresAt: new Date(Date.now() + accessLifetimeMs(config)),
    refreshExpiresAt: new Date(Date.now() + refreshLifetimeMs(config)),
  };
}

function toPair(
  config: AppConfig,
  userId: string,
  built: ReturnType<typeof buildPair>,
): MobileTokenPair {
  return {
    userId,
    tokenType: "Bearer",
    accessToken: built.accessToken,
    expiresIn: Math.floor(accessLifetimeMs(config) / 1000),
    accessExpiresAt: built.accessExpiresAt,
    refreshToken: built.refreshToken,
    refreshExpiresAt: built.refreshExpiresAt,
  };
}

/** Cấp cặp token mới sau khi đăng nhập hoặc xác minh email thành công. */
export async function issueMobileTokens(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  userId: string,
): Promise<MobileTokenPair> {
  const built = buildPair(config);
  const userAgent = String(request.headers["user-agent"] ?? "");

  await query(
    db,
    `
      INSERT INTO sessions (
        user_id, token_hash, ip_hash, user_agent_hash, expires_at,
        client, refresh_token_hash, refresh_expires_at
      ) VALUES ($1, $2, $3, $4, $5, 'mobile', $6, $7)
    `,
    [
      userId,
      sha256(built.accessToken),
      hashSensitiveValue(request.ip, config),
      hashSensitiveValue(userAgent, config),
      built.accessExpiresAt,
      sha256(built.refreshToken),
      built.refreshExpiresAt,
    ],
  );

  return toPair(config, userId, built);
}

/**
 * Đổi refresh token lấy cặp token mới. Xoay cả hai trên đúng dòng cũ, nên
 * refresh token vừa dùng sẽ chết ngay lập tức.
 */
export async function rotateMobileTokens(
  db: Database,
  config: AppConfig,
  refreshToken: string,
): Promise<MobileTokenPair> {
  const built = buildPair(config);

  const result = await query<{ user_id: string }>(
    db,
    `
      UPDATE sessions s
      SET token_hash = $1,
          expires_at = $2,
          refresh_token_hash = $3,
          refresh_expires_at = $4,
          last_seen_at = now()
      FROM users u
      WHERE u.id = s.user_id
        AND u.status = 'ACTIVE'
        AND s.refresh_token_hash = $5
        AND s.client = 'mobile'
        AND s.revoked_at IS NULL
        AND s.refresh_expires_at > now()
      RETURNING s.user_id
    `,
    [
      sha256(built.accessToken),
      built.accessExpiresAt,
      sha256(built.refreshToken),
      built.refreshExpiresAt,
      sha256(refreshToken),
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError(
      "REFRESH_TOKEN_INVALID",
      "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
      401,
    );
  }

  return toPair(config, row.user_id, built);
}

/** Đăng xuất một thiết bị: thu hồi bằng access token đang cầm. */
export async function revokeMobileSessionByAccessToken(
  db: Database,
  accessToken: string,
): Promise<void> {
  await query(
    db,
    `
      UPDATE sessions
      SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL
    `,
    [sha256(accessToken)],
  );
}
