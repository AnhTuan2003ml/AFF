import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import {
  hashSensitiveValue,
  randomToken,
  sha256,
} from "../lib/crypto.js";
import type { CurrentUser } from "../types/fastify.js";

const SESSION_COOKIE = "aff_session";
const BEARER_PREFIX = "Bearer ";

/**
 * Rút access token từ header Authorization.
 *
 * App di động gọi API từ nguồn khác nên trình duyệt/cookie không tham gia —
 * token đi thẳng trong header. Để ở đây (thay vì trong service) vì cả hook
 * xác thực lẫn bộ đếm hạn mức ở server.ts đều cần đọc, và cần đọc y hệt nhau.
 */
export function readBearerToken(request: {
  headers: { authorization?: string | undefined };
}): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

interface SessionRow {
  token_hash: string;
  last_seen_at: Date;
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: CurrentUser["role"];
  status: CurrentUser["status"];
  referral_code: string;
  avatar_url: string;
  is_special_partner: boolean;
}

// "Ghi nhớ đăng nhập": giữ phiên 30 ngày thay vì TTL mặc định. KHÔNG lưu mật
// khẩu ở đâu cả — chỉ kéo dài phiên; email điền sẵn và mật khẩu do trình duyệt
// tự nhớ (password manager).
const REMEMBER_TTL_HOURS = 24 * 30;

function cookieOptions(config: AppConfig, ttlHours: number) {
  return {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: ttlHours * 60 * 60,
  };
}

export async function registerSessionHooks(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
): Promise<void> {
  app.decorateRequest("currentUser", null);
  app.decorateRequest("sessionToken", null);
  app.decorateRequest("authScheme", null);

  app.addHook("onRequest", async (request, reply) => {
    // Bearer được ưu tiên: nếu app đã gửi token thì cookie (nếu có) không
    // liên quan, và ngược lại web không bao giờ gửi header này.
    const bearerToken = readBearerToken(request);
    // Có header Bearer là request của app, KHÔNG mang quyền cookie ngầm → miễn
    // CSRF ngay cả khi token hết hạn. Nhờ vậy endpoint đổi trạng thái trả 401
    // (để app tự refresh token) thay vì bị CSRF chặn bằng 403.
    if (bearerToken) request.authScheme = "bearer";
    const rawToken = bearerToken ?? request.cookies[SESSION_COOKIE];
    if (!rawToken) return;

    const result = await query<SessionRow>(
      db,
      `
        SELECT
          s.id, s.token_hash, s.last_seen_at, u.id AS user_id, u.email,
          u.full_name, u.role, u.status, u.referral_code, u.avatar_url,
          u.is_special_partner
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.status = 'ACTIVE'
        LIMIT 1
      `,
      [sha256(rawToken)],
    );

    const row = result.rows[0];
    if (!row) {
      // Chỉ dọn cookie hỏng của trình duyệt. Access token của app hết hạn là
      // chuyện bình thường — app sẽ tự gọi /auth/token/refresh — nên đừng
      // đụng vào cookie chỉ vì header sai.
      if (!bearerToken) reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return;
    }

    request.authScheme = bearerToken ? "bearer" : "cookie";
    request.sessionToken = rawToken;
    request.currentUser = {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      referralCode: row.referral_code,
      avatarUrl: row.avatar_url,
      isSpecialPartner: row.is_special_partner,
    };

    if (Date.now() - row.last_seen_at.getTime() > 15 * 60 * 1000) {
      void query(
        db,
        "UPDATE sessions SET last_seen_at = now() WHERE id = $1",
        [row.id],
      ).catch((error: unknown) => {
        request.log.warn({ err: error }, "Không cập nhật được last_seen_at");
      });
    }
  });
}

export async function createSession(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  options: { remember?: boolean } = {},
): Promise<void> {
  const ttlHours = options.remember
    ? REMEMBER_TTL_HOURS
    : config.SESSION_TTL_HOURS;
  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const userAgent = String(request.headers["user-agent"] ?? "");

  await query(
    db,
    `
      INSERT INTO sessions (
        user_id, token_hash, ip_hash, user_agent_hash, expires_at
      ) VALUES ($1, $2, $3, $4, $5)
    `,
    [
      userId,
      sha256(rawToken),
      hashSensitiveValue(request.ip, config),
      hashSensitiveValue(userAgent, config),
      expiresAt,
    ],
  );

  reply.setCookie(SESSION_COOKIE, rawToken, cookieOptions(config, ttlHours));
}

export async function revokeCurrentSession(
  db: Database,
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.sessionToken) {
    await query(
      db,
      "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1",
      [sha256(request.sessionToken)],
    );
  }
  reply.clearCookie(SESSION_COOKIE, {
    path: "/",
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
  });
}

export async function revokeAllUserSessions(
  db: Database,
  userId: string,
): Promise<void> {
  await query(
    db,
    "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}

export interface UserSessionRow {
  id: string;
  client: string;
  created_at: Date;
  last_seen_at: Date;
  is_current: boolean;
}

/** Danh sách phiên đang hoạt động của người dùng (không lộ token/hash). */
export async function listUserSessions(
  db: Database,
  userId: string,
  currentToken: string | null,
): Promise<UserSessionRow[]> {
  const result = await query<UserSessionRow>(
    db,
    `
      SELECT id, client, created_at, last_seen_at,
        (token_hash = $2) AS is_current
      FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC
    `,
    [userId, currentToken ? sha256(currentToken) : ""],
  );
  return result.rows;
}
