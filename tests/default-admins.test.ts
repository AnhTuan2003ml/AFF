import { afterEach, describe, expect, it } from "vitest";
import { bootstrapDefaultAdmins, syncAdminAccountsFromEnv } from "../src/auth/admin-sync.js";
import { DEFAULT_ADMINS } from "../src/auth/default-admins.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("bootstrapDefaultAdmins (hardcode, không phụ thuộc .env)", () => {
  it("tạo đủ các admin mặc định với mật khẩu ngẫu nhiên đã hash, không đoán được", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const result = await bootstrapDefaultAdmins(db);
    expect(result.created.sort()).toEqual(
      DEFAULT_ADMINS.map((a) => a.email.toLowerCase()).sort(),
    );

    for (const admin of DEFAULT_ADMINS) {
      const row = await db.query<{ role: string; status: string; password_hash: string }>(
        "SELECT role, status, password_hash FROM users WHERE lower(email) = $1",
        [admin.email.toLowerCase()],
      );
      expect(row.rows[0]?.role).toBe(admin.role);
      expect(row.rows[0]?.status).toBe("ACTIVE");
      expect(row.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    }
  });

  it("chạy lại lần hai không tạo trùng và không đổi mật khẩu đã có", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await bootstrapDefaultAdmins(db);
    const before = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE lower(email) = $1",
      [DEFAULT_ADMINS[0]!.email.toLowerCase()],
    );

    const second = await bootstrapDefaultAdmins(db);
    expect(second.created).toEqual([]);

    const after = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE lower(email) = $1",
      [DEFAULT_ADMINS[0]!.email.toLowerCase()],
    );
    expect(after.rows[0]?.password_hash).toBe(before.rows[0]?.password_hash);

    const total = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')",
    );
    expect(Number(total.rows[0]?.count)).toBe(DEFAULT_ADMINS.length);
  });

  it("nếu tài khoản đã tồn tại (vd tự đăng ký trước) chỉ nâng role, giữ nguyên mật khẩu cũ", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const admin = DEFAULT_ADMINS[0]!;
    await db.query(
      `INSERT INTO users (email, full_name, password_hash, status, role, referral_code)
       VALUES ($1, 'Ten Cu', '$argon2id$fake-existing-hash', 'ACTIVE', 'USER', 'PRESEEDED1')`,
      [admin.email.toLowerCase()],
    );

    await bootstrapDefaultAdmins(db);

    const row = await db.query<{ role: string; password_hash: string; full_name: string }>(
      "SELECT role, password_hash, full_name FROM users WHERE lower(email) = $1",
      [admin.email.toLowerCase()],
    );
    expect(row.rows[0]?.role).toBe(admin.role);
    expect(row.rows[0]?.password_hash).toBe("$argon2id$fake-existing-hash");
    expect(row.rows[0]?.full_name).toBe("Ten Cu");
  });

  it("allowlist nghiêm ngặt từ .env không bao giờ thu hồi quyền của admin hardcode", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await bootstrapDefaultAdmins(db);

    // ADMIN_ACCOUNTS_JSON từ .env chỉ nhắc tới một admin HOÀN TOÀN khác,
    // không liên quan gì tới 2 admin hardcode.
    const config = {
      ...testConfig(),
      ADMIN_SYNC_FROM_ENV: true,
      ADMIN_STRICT_ALLOWLIST: true,
      ADMIN_ACCOUNTS_JSON: JSON.stringify([
        {
          email: "someone-else@example.com",
          name: "Someone Else",
          initialPassword: "MatKhauThat123",
          role: "admin",
          active: true,
        },
      ]),
    };
    const result = await syncAdminAccountsFromEnv(db, config);
    expect(result.revoked).toEqual([]);

    for (const admin of DEFAULT_ADMINS) {
      const row = await db.query<{ role: string }>(
        "SELECT role FROM users WHERE lower(email) = $1",
        [admin.email.toLowerCase()],
      );
      expect(row.rows[0]?.role).toBe(admin.role);
    }
  });
});
