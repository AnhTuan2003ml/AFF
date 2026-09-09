import { afterEach, describe, expect, it } from "vitest";
import { query, type Database } from "../src/db.js";
import { hashPassword } from "../src/lib/password.js";
import { authenticateWithEmail } from "../src/services/auth.js";
import { createTestDb } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const EMAIL = "user@example.com";
const PASSWORD = "GoodPass123@";

async function seed(db: Database): Promise<void> {
  const hash = await hashPassword(PASSWORD);
  await query(
    db,
    `INSERT INTO users (email, full_name, status, role, referral_code, password_hash)
     VALUES ($1, 'User', 'ACTIVE', 'USER', '556677', $2)`,
    [EMAIL, hash],
  );
}

describe("tự động khóa đăng nhập", () => {
  it("sai 5 lần → khóa tạm; mật khẩu đúng vẫn bị chặn", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await seed(db);

    for (let i = 0; i < 5; i += 1) {
      await expect(authenticateWithEmail(db, EMAIL, "wrong")).rejects.toThrow(
        /không đúng/,
      );
    }
    // Đã khóa: mật khẩu đúng cũng bị từ chối.
    await expect(authenticateWithEmail(db, EMAIL, PASSWORD)).rejects.toThrow(
      /tạm khóa/,
    );
  });

  it("đăng nhập đúng trước ngưỡng → reset bộ đếm, không khóa", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await seed(db);

    for (let i = 0; i < 4; i += 1) {
      await expect(authenticateWithEmail(db, EMAIL, "wrong")).rejects.toThrow(
        /không đúng/,
      );
    }
    // Lần thứ 5 đúng → vào được và reset.
    const user = await authenticateWithEmail(db, EMAIL, PASSWORD);
    expect(user.email).toBe(EMAIL);
    const row = await query<{ failed_login_count: number }>(
      db,
      "SELECT failed_login_count FROM users WHERE email = $1",
      [EMAIL],
    );
    expect(row.rows[0]?.failed_login_count).toBe(0);
  });
});
