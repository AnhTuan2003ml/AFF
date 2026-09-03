import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/db.js";
import { listMissionReferralPeople } from "../src/services/mission.js";
import { createTestDb } from "./helpers.js";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

let counter = 0;
async function taoUser(name: string): Promise<string> {
  counter += 1;
  const r = await db.query(
    `INSERT INTO users (email, full_name, password_hash, status, referral_code)
     VALUES ($1, $2, 'argon2-hash', 'ACTIVE', $3) RETURNING id`,
    [`u${counter}@example.com`, name, `RL${String(counter).padStart(5, "0")}`],
  );
  return r.rows[0]?.id as string;
}

describe("Danh sách người được giới thiệu — đồng bộ khi có user bị xóa", () => {
  it("user đã xóa (deleted_at) biến mất khỏi danh sách của người giới thiệu", async () => {
    const referrer = await taoUser("Người mời");
    const a = await taoUser("Bạn A");
    const b = await taoUser("Bạn B");
    await db.query(
      `INSERT INTO referrals (referrer_user_id, referred_user_id, status)
       VALUES ($1, $2, 'ELIGIBLE'), ($1, $3, 'ELIGIBLE')`,
      [referrer, a, b],
    );

    let list = await listMissionReferralPeople(db, referrer);
    expect(list).toHaveLength(2);

    // Xóa mềm bạn A (giống deleteOwnAccount: đặt deleted_at + DISABLED).
    await db.query(
      `UPDATE users SET deleted_at = now(), status = 'DISABLED',
         full_name = 'Người dùng đã xóa' WHERE id = $1`,
      [a],
    );

    list = await listMissionReferralPeople(db, referrer);
    expect(list).toHaveLength(1);
    expect(list[0]?.fullName).toBe("Bạn B");
  });
});
