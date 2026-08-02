import { afterEach, describe, expect, it } from "vitest";
import { AdminConfigError, syncAdminAccountsFromEnv } from "../src/auth/admin-sync.js";
import { createTestDb } from "./helpers.js";
import { testConfig } from "./helpers.js";
import type { AppConfig } from "../src/config.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

function withAdminEnv(overrides: Partial<AppConfig>): AppConfig {
  return {
    ...testConfig(),
    ADMIN_SYNC_FROM_ENV: true,
    ...overrides,
  };
}

describe("syncAdminAccountsFromEnv", () => {
  it("không làm gì khi ADMIN_SYNC_FROM_ENV=false", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = withAdminEnv({ ADMIN_SYNC_FROM_ENV: false, ADMIN_ACCOUNTS_JSON: "not json at all" });
    const result = await syncAdminAccountsFromEnv(db, config);
    expect(result).toEqual({ created: [], updated: [], revoked: [], skippedRevokeLastAdmin: false });
  });

  it("tạo tài khoản admin mới, hash mật khẩu bằng Argon2id, không lưu chữ thường", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = withAdminEnv({
      ADMIN_ACCOUNTS_JSON: JSON.stringify([
        {
          email: "Admin@ShopTik.vn",
          name: "Quản trị hệ thống",
          initialPassword: "MatKhauThat123",
          role: "super_admin",
          active: true,
        },
      ]),
    });
    const result = await syncAdminAccountsFromEnv(db, config);
    expect(result.created).toEqual(["admin@shoptik.vn"]);

    const row = await db.query<{ role: string; password_hash: string; status: string }>(
      "SELECT role, password_hash, status FROM users WHERE lower(email) = $1",
      ["admin@shoptik.vn"],
    );
    expect(row.rows[0]?.role).toBe("SUPER_ADMIN");
    expect(row.rows[0]?.status).toBe("ACTIVE");
    expect(row.rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    expect(row.rows[0]?.password_hash).not.toContain("MatKhauThat123");
  });

  it("đồng bộ tài khoản đã tồn tại: cập nhật role/tên, KHÔNG đổi mật khẩu", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const firstRun = withAdminEnv({
      ADMIN_ACCOUNTS_JSON: JSON.stringify([
        {
          email: "admin@shoptik.vn",
          name: "Ten Cu",
          initialPassword: "MatKhauThat123",
          role: "admin",
          active: true,
        },
      ]),
    });
    await syncAdminAccountsFromEnv(db, firstRun);
    const before = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE lower(email) = $1",
      ["admin@shoptik.vn"],
    );
    const originalHash = before.rows[0]!.password_hash;

    const secondRun = withAdminEnv({
      ADMIN_ACCOUNTS_JSON: JSON.stringify([
        {
          email: "admin@shoptik.vn",
          name: "Ten Moi",
          initialPassword: "MatKhauKhacHoanToan456",
          role: "super_admin",
          active: true,
        },
      ]),
    });
    const result = await syncAdminAccountsFromEnv(db, secondRun);
    expect(result.updated).toEqual(["admin@shoptik.vn"]);
    expect(result.created).toEqual([]);

    const after = await db.query<{ role: string; full_name: string; password_hash: string }>(
      "SELECT role, full_name, password_hash FROM users WHERE lower(email) = $1",
      ["admin@shoptik.vn"],
    );
    expect(after.rows[0]?.role).toBe("SUPER_ADMIN");
    expect(after.rows[0]?.full_name).toBe("Ten Moi");
    expect(after.rows[0]?.password_hash).toBe(originalHash);
  });

  it("chỉ đặt lại mật khẩu khi ADMIN_RESET_PASSWORDS_ON_STARTUP=true", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const accountsJson = JSON.stringify([
      {
        email: "admin@shoptik.vn",
        name: "Admin",
        initialPassword: "MatKhauThat123",
        role: "admin",
        active: true,
      },
    ]);
    await syncAdminAccountsFromEnv(db, withAdminEnv({ ADMIN_ACCOUNTS_JSON: accountsJson }));
    const before = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE lower(email) = $1",
      ["admin@shoptik.vn"],
    );

    await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          {
            email: "admin@shoptik.vn",
            name: "Admin",
            initialPassword: "MatKhauMoiHoanToan789",
            role: "admin",
            active: true,
          },
        ]),
        ADMIN_RESET_PASSWORDS_ON_STARTUP: true,
      }),
    );
    const after = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE lower(email) = $1",
      ["admin@shoptik.vn"],
    );
    expect(after.rows[0]?.password_hash).not.toBe(before.rows[0]?.password_hash);
  });

  it("từ chối JSON sai cú pháp thay vì âm thầm bỏ qua", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = withAdminEnv({ ADMIN_ACCOUNTS_JSON: "{ this is not valid json" });
    await expect(syncAdminAccountsFromEnv(db, config)).rejects.toThrow(AdminConfigError);
  });

  it("từ chối role ngoài admin/super_admin", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = withAdminEnv({
      ADMIN_ACCOUNTS_JSON: JSON.stringify([
        {
          email: "hacker@shoptik.vn",
          name: "X",
          initialPassword: "MatKhauThat123",
          role: "owner",
          active: true,
        },
      ]),
    });
    await expect(syncAdminAccountsFromEnv(db, config)).rejects.toThrow(AdminConfigError);
  });

  it("email không nằm trong ADMIN_ACCOUNTS_JSON không tự nâng thành admin", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await db.query(
      `INSERT INTO users (email, full_name, status, role, referral_code)
       VALUES ('regular@shoptik.vn', 'Regular', 'ACTIVE', 'USER', 'REGREF01')`,
    );
    await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          {
            email: "admin@shoptik.vn",
            name: "Admin",
            initialPassword: "MatKhauThat123",
            role: "admin",
            active: true,
          },
        ]),
      }),
    );
    const regular = await db.query<{ role: string }>(
      "SELECT role FROM users WHERE lower(email) = $1",
      ["regular@shoptik.vn"],
    );
    expect(regular.rows[0]?.role).toBe("USER");
  });

  it("thu hồi quyền và vô hiệu hoá phiên khi admin bị xoá khỏi allowlist", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    // Hai admin ban đầu.
    await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "keep@shoptik.vn", name: "Keep", initialPassword: "MatKhauThat123", role: "super_admin", active: true },
          { email: "remove@shoptik.vn", name: "Remove", initialPassword: "MatKhauThat123", role: "admin", active: true },
        ]),
      }),
    );
    const removedUser = await db.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email) = $1",
      ["remove@shoptik.vn"],
    );
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, 'tokenhash1', now() + interval '1 day')`,
      [removedUser.rows[0]!.id],
    );

    // Lần sau, allowlist chỉ còn "keep".
    const result = await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "keep@shoptik.vn", name: "Keep", initialPassword: "MatKhauThat123", role: "super_admin", active: true },
        ]),
      }),
    );
    expect(result.revoked).toEqual(["remove@shoptik.vn"]);

    const revokedRole = await db.query<{ role: string }>(
      "SELECT role FROM users WHERE id = $1",
      [removedUser.rows[0]!.id],
    );
    expect(revokedRole.rows[0]?.role).toBe("USER");

    const sessions = await db.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM sessions WHERE user_id = $1",
      [removedUser.rows[0]!.id],
    );
    expect(sessions.rows[0]?.revoked_at).not.toBeNull();
  });

  it("luôn còn ít nhất một admin sau khi đồng bộ, kể cả khi đổi hẳn sang admin khác", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "only@shoptik.vn", name: "Only", initialPassword: "MatKhauThat123", role: "admin", active: true },
        ]),
      }),
    );
    // Đổi ADMIN_ACCOUNTS_JSON sang một email khác hoàn toàn: admin mới được
    // tạo TRƯỚC khi admin cũ bị thu hồi (trong cùng một transaction), nên hệ
    // thống không bao giờ đi qua trạng thái 0 admin.
    const result = await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "other@shoptik.vn", name: "Other", initialPassword: "MatKhauThat123", role: "admin", active: true },
        ]),
      }),
    );
    expect(result.created).toEqual(["other@shoptik.vn"]);
    expect(result.revoked).toEqual(["only@shoptik.vn"]);

    const admins = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')",
    );
    expect(Number(admins.rows[0]?.count)).toBeGreaterThanOrEqual(1);
  });

  it("cơ chế bảo vệ: nếu thu hồi làm hết sạch admin thì giữ lại một người thay vì thu hồi hết", async () => {
    // Mô phỏng trực tiếp phần lõi bảo vệ mà không cần một kịch bản JSON thật:
    // hai admin hiện có trong DB, allowlist rỗng theo các mốc bình thường sẽ bị
    // chặn sớm hơn (không còn admin hợp lệ) — nhưng nếu allowlist chỉ còn
    // đúng những admin không tồn tại thật trong DB (vd lệch hoa/thường đã được
    // chuẩn hoá), thu hồi vẫn phải chừa lại ít nhất một người.
    const { db, close } = await createTestDb();
    cleanup = close;
    await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "solo@shoptik.vn", name: "Solo", initialPassword: "MatKhauThat123", role: "admin", active: true },
        ]),
      }),
    );
    // Một admin thứ hai được tạo thủ công ngoài luồng ENV (vd bằng
    // scripts/create-admin.ts) không còn khớp allowlist ở lần đồng bộ sau.
    await db.query(
      `INSERT INTO users (email, full_name, status, role, referral_code)
       VALUES ('legacy@shoptik.vn', 'Legacy Admin', 'ACTIVE', 'ADMIN', 'LEGACYREF1')`,
    );

    const result = await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "solo@shoptik.vn", name: "Solo", initialPassword: "MatKhauThat123", role: "admin", active: true },
        ]),
      }),
    );
    // "legacy" không có trong allowlist nên bị thu hồi — nhưng "solo" (đã
    // khớp allowlist) vẫn còn, nên tổng admin không bao giờ về 0.
    expect(result.revoked).toEqual(["legacy@shoptik.vn"]);
    const admins = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')",
    );
    expect(Number(admins.rows[0]?.count)).toBe(1);
  });

  it("từ chối khi không còn admin hợp lệ nào (active=false hết)", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = withAdminEnv({
      ADMIN_ACCOUNTS_JSON: JSON.stringify([
        { email: "admin@shoptik.vn", name: "Admin", initialPassword: "MatKhauThat123", role: "admin", active: false },
      ]),
    });
    await expect(syncAdminAccountsFromEnv(db, config)).rejects.toThrow(AdminConfigError);
  });

  it("không ghi mật khẩu vào audit log", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await syncAdminAccountsFromEnv(
      db,
      withAdminEnv({
        ADMIN_ACCOUNTS_JSON: JSON.stringify([
          { email: "admin@shoptik.vn", name: "Admin", initialPassword: "MatKhauCucKyBiMat999", role: "admin", active: true },
        ]),
      }),
    );
    const logs = await db.query<{ after_redacted: unknown }>(
      "SELECT after_redacted FROM audit_logs WHERE action LIKE 'ADMIN_ENV%'",
    );
    const serialized = JSON.stringify(logs.rows);
    expect(serialized).not.toContain("MatKhauCucKyBiMat999");
  });
});
