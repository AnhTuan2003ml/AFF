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
}

function cookieOptions(config: AppConfig) {
  return {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: config.SESSION_TTL_HOURS * 60 * 60,
  };
}

export async function registerSessionHooks(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
): Promise<void> {
  app.decorateRequest("currentUser", null);
  app.decorateRequest("sessionToken", null);

  app.addHook("onRequest", async (request, reply) => {
    const rawToken = request.cookies[SESSION_COOKIE];
    if (!rawToken) return;

    const result = await query<SessionRow>(
      db,
      `
        SELECT
          s.id, s.token_hash, s.last_seen_at, u.id AS user_id, u.email,
          u.full_name, u.role, u.status, u.referral_code
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
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return;
    }

    request.sessionToken = rawToken;
    request.currentUser = {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      status: row.status,
      referralCode: row.referral_code,
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
): Promise<void> {
  const rawToken = randomToken(32);
  const expiresAt = new Date(
    Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000,
  );
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

  reply.setCookie(SESSION_COOKIE, rawToken, cookieOptions(config));
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
