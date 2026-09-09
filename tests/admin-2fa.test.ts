import { afterEach, describe, expect, it } from "vitest";
import { query, type Database } from "../src/db.js";
import { totpToken } from "../src/lib/totp.js";
import {
  confirmEnroll,
  disable2fa,
  get2faState,
  requires2fa,
  startEnroll,
  verifyUserTotp,
} from "../src/services/admin-2fa.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function seedAdmin(db: Database): Promise<{ id: string; email: string }> {
  const email = "boss@shoptik.vn";
  const r = await query<{ id: string }>(
    db,
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ($1, 'Boss', 'ACTIVE', 'ADMIN', '900900') RETURNING id`,
    [email],
  );
  return { id: r.rows[0]!.id, email };
}

describe("admin 2FA (TOTP)", () => {
  it("thiết lập → xác nhận bằng mã đúng → bật; secret lưu mã hóa", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = testConfig();
    const admin = await seedAdmin(db);

    expect((await get2faState(db, admin.id)).enabled).toBe(false);
    expect(await requires2fa(db, admin.id)).toBe(false);

    const enroll = await startEnroll(db, config, admin);
    expect(enroll.secret).toMatch(/^[A-Z2-7]+$/);
    // Chưa bật cho tới khi confirm.
    expect((await get2faState(db, admin.id)).enabled).toBe(false);

    // Secret trong DB phải MÃ HÓA (không phải plaintext).
    const stored = await query<{ totp_secret: string }>(
      db,
      "SELECT totp_secret FROM users WHERE id = $1",
      [admin.id],
    );
    expect(stored.rows[0]?.totp_secret).not.toBe(enroll.secret);

    // Mã sai → không bật.
    await expect(confirmEnroll(db, config, admin.id, "000000")).rejects.toThrow(
      /không đúng/,
    );
    expect((await get2faState(db, admin.id)).enabled).toBe(false);

    // Mã đúng → bật.
    await confirmEnroll(db, config, admin.id, totpToken(enroll.secret));
    const state = await get2faState(db, admin.id);
    expect(state.enabled).toBe(true);
    expect(state.enabledAt).not.toBeNull();
    expect(await requires2fa(db, admin.id)).toBe(true);

    // Đăng nhập: verify mã đúng/sai.
    expect(await verifyUserTotp(db, config, admin.id, totpToken(enroll.secret))).toBe(true);
    expect(await verifyUserTotp(db, config, admin.id, "111111")).toBe(false);
  });

  it("tắt 2FA → xóa secret, requires2fa=false", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = testConfig();
    const admin = await seedAdmin(db);
    const enroll = await startEnroll(db, config, admin);
    await confirmEnroll(db, config, admin.id, totpToken(enroll.secret));

    await disable2fa(db, admin.id);
    expect((await get2faState(db, admin.id)).enabled).toBe(false);
    expect(await requires2fa(db, admin.id)).toBe(false);
    const stored = await query<{ totp_secret: string | null }>(
      db,
      "SELECT totp_secret FROM users WHERE id = $1",
      [admin.id],
    );
    expect(stored.rows[0]?.totp_secret).toBeNull();
  });
});
