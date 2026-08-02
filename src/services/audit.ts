import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database, type Transaction } from "../db.js";
import { hashSensitiveValue } from "../lib/crypto.js";

export async function writeAuditLog(
  db: Database | Transaction,
  config: AppConfig,
  request: FastifyRequest,
  params: {
    action: string;
    targetType: string;
    targetId?: string;
    reason?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  await query(
    db,
    `
      INSERT INTO audit_logs (
        actor_user_id, action, target_type, target_id, reason,
        before_redacted, after_redacted, request_id, ip_hash
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
    `,
    [
      request.currentUser?.id ?? null,
      params.action,
      params.targetType,
      params.targetId ?? null,
      params.reason ?? null,
      params.before ? JSON.stringify(params.before) : null,
      params.after ? JSON.stringify(params.after) : null,
      request.id,
      hashSensitiveValue(request.ip, config),
    ],
  );
}
