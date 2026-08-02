import { z } from "zod";
import type { AppConfig } from "../config.js";
import { query, type Database, withTransaction, type Transaction } from "../db.js";
import { normalizeEmail, randomReferralCode } from "../lib/crypto.js";
import { hashPassword, passwordSchema } from "../lib/password.js";
import { DEFAULT_ADMINS } from "./default-admins.js";

export class AdminConfigError extends Error {}

const DEFAULT_ADMIN_EMAILS = new Set(
  DEFAULT_ADMINS.map((admin) => normalizeEmail(admin.email)),
);

const adminAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  initialPassword: passwordSchema,
  role: z.enum(["super_admin", "admin"]),
  active: z.boolean(),
});

const adminAccountsSchema = z.array(adminAccountSchema);

const ROLE_MAP = {
  super_admin: "SUPER_ADMIN",
  admin: "ADMIN",
} as const;

export interface AdminSyncResult {
  created: string[];
  updated: string[];
  revoked: string[];
  skippedRevokeLastAdmin: boolean;
}

async function writeSyncAuditLog(
  client: Transaction,
  action: string,
  after: Record<string, unknown>,
): Promise<void> {
  await query(
    client,
    `
      INSERT INTO audit_logs (action, target_type, after_redacted)
      VALUES ($1, 'ADMIN_ACCOUNT', $2::jsonb)
    `,
    [action, JSON.stringify(after)],
  );
}

export interface DefaultAdminBootstrapResult {
  created: string[];
  updated: string[];
}

/**
 * Đảm bảo danh sách admin mặc định (hardcode trong src/auth/default-admins.ts)
 * luôn tồn tại và có quyền SUPER_ADMIN/ADMIN — chạy trên MỌI máy, không phụ
 * thuộc .env. Tài khoản chưa tồn tại (máy mới) được tạo với initialPassword
 * khai báo sẵn làm mật khẩu đăng nhập ban đầu. Tài khoản đã tồn tại chỉ được
 * đồng bộ role/trạng thái — KHÔNG bao giờ đụng mật khẩu hiện tại, kể cả khi
 * đã đổi mật khẩu khác initialPassword từ trước.
 */
export async function bootstrapDefaultAdmins(
  db: Database,
): Promise<DefaultAdminBootstrapResult> {
  const result: DefaultAdminBootstrapResult = { created: [], updated: [] };

  await withTransaction(db, async (client) => {
    for (const admin of DEFAULT_ADMINS) {
      const email = normalizeEmail(admin.email);
      const existing = await query<{
        id: string;
        role: string;
        status: string;
        full_name: string;
      }>(client, "SELECT id, role, status, full_name FROM users WHERE lower(email) = $1", [
        email,
      ]);
      const row = existing.rows[0];

      if (!row) {
        const passwordHash = await hashPassword(admin.initialPassword);
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
              email, full_name, password_hash, status, role,
              referral_code, email_verified_at
            ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, now())
            RETURNING id
          `,
          [email, admin.name, passwordHash, admin.role, referralCode],
        );
        await query(
          client,
          `
            INSERT INTO auth_identities (user_id, provider, provider_subject)
            VALUES ($1, 'EMAIL', $2)
          `,
          [inserted.rows[0]!.id, email],
        );
        result.created.push(email);
        await writeSyncAuditLog(client, "ADMIN_DEFAULT_BOOTSTRAP_CREATE", {
          email,
          role: admin.role,
        });
        continue;
      }

      const needsUpdate =
        row.role !== admin.role ||
        row.status !== "ACTIVE";
      if (needsUpdate) {
        await query(
          client,
          "UPDATE users SET role = $2, status = 'ACTIVE' WHERE id = $1",
          [row.id, admin.role],
        );
        result.updated.push(email);
        await writeSyncAuditLog(client, "ADMIN_DEFAULT_BOOTSTRAP_SYNC", {
          email,
          role: admin.role,
          previousRole: row.role,
        });
      }
    }
  });

  return result;
}

/**
 * Đồng bộ tài khoản admin từ ADMIN_ACCOUNTS_JSON khi ứng dụng khởi động.
 * Không bao giờ ghi mật khẩu hoặc nội dung ENV vào log — chỉ email/role/hành
 * động. Ném lỗi (dừng khởi động) nếu cấu hình sai cú pháp hoặc không còn admin
 * hợp lệ nào, thay vì âm thầm chạy với quyền sai.
 */
export async function syncAdminAccountsFromEnv(
  db: Database,
  config: AppConfig,
): Promise<AdminSyncResult> {
  const result: AdminSyncResult = {
    created: [],
    updated: [],
    revoked: [],
    skippedRevokeLastAdmin: false,
  };
  if (!config.ADMIN_SYNC_FROM_ENV) return result;

  let rawList: unknown;
  try {
    rawList = JSON.parse(config.ADMIN_ACCOUNTS_JSON);
  } catch {
    throw new AdminConfigError(
      "ADMIN_ACCOUNTS_JSON không phải JSON hợp lệ. Kiểm tra lại cú pháp trong .env.",
    );
  }
  const parsed = adminAccountsSchema.safeParse(rawList);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new AdminConfigError(`ADMIN_ACCOUNTS_JSON không hợp lệ: ${details}`);
  }

  const accounts = parsed.data.map((account) => ({
    ...account,
    email: normalizeEmail(account.email),
  }));

  const seen = new Set<string>();
  for (const account of accounts) {
    if (seen.has(account.email)) {
      throw new AdminConfigError(
        `ADMIN_ACCOUNTS_JSON chứa email trùng lặp: ${account.email}`,
      );
    }
    seen.add(account.email);
  }

  const activeAccounts = accounts.filter((account) => account.active);
  if (activeAccounts.length === 0) {
    throw new AdminConfigError(
      "ADMIN_ACCOUNTS_JSON không có tài khoản admin hợp lệ nào đang active.",
    );
  }

  await withTransaction(db, async (client) => {
    for (const account of accounts) {
      const role = ROLE_MAP[account.role];
      const existing = await query<{
        id: string;
        role: string;
        status: string;
        full_name: string;
      }>(client, "SELECT id, role, status, full_name FROM users WHERE lower(email) = $1", [
        account.email,
      ]);
      const row = existing.rows[0];

      // Tài khoản active=false trong ENV không được tạo mới cũng không được
      // đồng bộ role/trạng thái ở đây — nếu tài khoản đó đang là admin trong
      // DB, việc thu hồi quyền được xử lý thống nhất ở bước allowlist bên
      // dưới (vì allowedEmails chỉ gồm các tài khoản active=true).
      if (!account.active) continue;

      if (!row) {
        const passwordHash = await hashPassword(account.initialPassword);
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
              email, full_name, password_hash, status, role,
              referral_code, email_verified_at
            ) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, now())
            RETURNING id
          `,
          [account.email, account.name, passwordHash, role, referralCode],
        );
        await query(
          client,
          `
            INSERT INTO auth_identities (user_id, provider, provider_subject)
            VALUES ($1, 'EMAIL', $2)
          `,
          [inserted.rows[0]!.id, account.email],
        );
        result.created.push(account.email);
        await writeSyncAuditLog(client, "ADMIN_ENV_SYNC_CREATE", {
          email: account.email,
          role,
        });
        continue;
      }

      const needsUpdate =
        row.role !== role ||
        row.full_name !== account.name ||
        row.status !== "ACTIVE";
      if (needsUpdate) {
        await query(
          client,
          `
            UPDATE users
            SET role = $2, full_name = $3, status = 'ACTIVE'
            WHERE id = $1
          `,
          [row.id, role, account.name],
        );
        result.updated.push(account.email);
        await writeSyncAuditLog(client, "ADMIN_ENV_SYNC_UPDATE", {
          email: account.email,
          role,
          previousRole: row.role,
        });
      }

      if (config.ADMIN_RESET_PASSWORDS_ON_STARTUP) {
        const passwordHash = await hashPassword(account.initialPassword);
        await query(
          client,
          "UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1",
          [row.id, passwordHash],
        );
        await writeSyncAuditLog(client, "ADMIN_ENV_PASSWORD_RESET", {
          email: account.email,
        });
      }
    }

    if (config.ADMIN_STRICT_ALLOWLIST) {
      // Admin mặc định (hardcode trong default-admins.ts) không bao giờ bị
      // allowlist từ .env thu hồi, dù có mặt trong ADMIN_ACCOUNTS_JSON hay không.
      const allowedEmails = new Set([
        ...activeAccounts.map((account) => account.email),
        ...DEFAULT_ADMIN_EMAILS,
      ]);
      const currentAdmins = await query<{ id: string; email: string }>(
        client,
        `
          SELECT id, lower(email) AS email
          FROM users
          WHERE role IN ('ADMIN', 'SUPER_ADMIN')
          ORDER BY created_at ASC
        `,
      );
      let toRevoke = currentAdmins.rows.filter(
        (admin) => !allowedEmails.has(admin.email),
      );
      const remaining = currentAdmins.rows.length - toRevoke.length;
      if (remaining === 0 && toRevoke.length > 0) {
        toRevoke = toRevoke.slice(1);
        result.skippedRevokeLastAdmin = true;
      }
      for (const admin of toRevoke) {
        await query(client, "UPDATE users SET role = 'USER' WHERE id = $1", [
          admin.id,
        ]);
        await query(
          client,
          "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
          [admin.id],
        );
        result.revoked.push(admin.email);
        await writeSyncAuditLog(client, "ADMIN_ENV_REVOKE", {
          email: admin.email,
        });
      }
    }

    const finalCount = await query<{ count: string }>(
      client,
      "SELECT count(*)::text AS count FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')",
    );
    if (Number(finalCount.rows[0]?.count ?? "0") === 0) {
      throw new AdminConfigError(
        "Đồng bộ admin từ ENV sẽ khiến hệ thống không còn tài khoản quản trị nào. Đã hủy khởi động.",
      );
    }
  });

  return result;
}
