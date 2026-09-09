import { afterEach, describe, expect, it } from "vitest";
import { query, type Database } from "../src/db.js";
import { getRiskDashboard } from "../src/services/fraud-signals.js";
import { createTestDb } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function seedUser(db: Database, email: string, code: string): Promise<string> {
  const r = await query<{ id: string }>(
    db,
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ($1, $2, 'ACTIVE', 'USER', $3) RETURNING id`,
    [email, email.split("@")[0], code],
  );
  return r.rows[0]!.id;
}

async function addOrder(db: Database, userId: string, code: string, status: string) {
  await query(
    db,
    `INSERT INTO orders (user_id, platform, platform_order_id, status)
     VALUES ($1, 'SHOPEE', $2, $3)`,
    [userId, code, status],
  );
}

async function addSession(db: Database, userId: string, ipHash: string, token: string) {
  await query(
    db,
    `INSERT INTO sessions (user_id, token_hash, ip_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 day')`,
    [userId, token, ipHash],
  );
}

describe("fraud-signals", () => {
  it("nêu tài khoản tỷ lệ hủy/hoàn cao (≥5 đơn, ≥50%)", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const bad = await seedUser(db, "bad@example.com", "111111");
    const good = await seedUser(db, "good@example.com", "222222");

    // bad: 6 đơn, 4 hủy → 67%
    for (let i = 0; i < 4; i += 1) await addOrder(db, bad, `b-c${i}`, "CANCELLED");
    for (let i = 0; i < 2; i += 1) await addOrder(db, bad, `b-a${i}`, "APPROVED");
    // good: 6 đơn, 1 hủy → 17%
    await addOrder(db, good, "g-c0", "CANCELLED");
    for (let i = 0; i < 5; i += 1) await addOrder(db, good, `g-a${i}`, "APPROVED");

    const risk = await getRiskDashboard(db);
    const emails = risk.highCancel.map((r) => r.email);
    expect(emails).toContain("bad@example.com");
    expect(emails).not.toContain("good@example.com");
    const badRow = risk.highCancel.find((r) => r.email === "bad@example.com")!;
    expect(badRow.total).toBe(6);
    expect(badRow.bad).toBe(4);
    expect(badRow.cancel_rate).toBe(67);
  });

  it("nêu nhiều tài khoản cùng một IP (≥3)", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const u1 = await seedUser(db, "a1@example.com", "301301");
    const u2 = await seedUser(db, "a2@example.com", "302302");
    const u3 = await seedUser(db, "a3@example.com", "303303");
    const lone = await seedUser(db, "lone@example.com", "304304");

    await addSession(db, u1, "SHARED_IP_HASH", "t1");
    await addSession(db, u2, "SHARED_IP_HASH", "t2");
    await addSession(db, u3, "SHARED_IP_HASH", "t3");
    await addSession(db, lone, "OTHER_IP_HASH", "t4");

    const risk = await getRiskDashboard(db);
    expect(risk.sharedIp.length).toBe(1);
    expect(risk.sharedIp[0]!.accounts).toBe(3);
  });
});
