import { afterEach, describe, expect, it } from "vitest";
import { query, type Database } from "../src/db.js";
import { randomReferralCode } from "../src/lib/crypto.js";
import {
  applyReferralToUser,
  decideReferralCodeRequest,
  getReferralCodeState,
  listReferralCodeRequests,
  requestReferralCodeChange,
  resolveReferrerByCode,
} from "../src/services/referral-code.js";
import { createTestDb } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function seedUser(
  db: Database,
  options: { email: string; code: string; partner?: boolean; role?: string },
): Promise<string> {
  const row = await query<{ id: string }>(
    db,
    `INSERT INTO users (email, full_name, status, role, referral_code, is_special_partner)
     VALUES ($1, $2, 'ACTIVE', $3, $4, $5) RETURNING id`,
    [
      options.email,
      options.email.split("@")[0],
      options.role ?? "USER",
      options.code,
      Boolean(options.partner),
    ],
  );
  return row.rows[0]!.id;
}

describe("mã giới thiệu — sinh mã & tra cứu", () => {
  it("randomReferralCode ra đúng 6 chữ số", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(randomReferralCode()).toMatch(/^\d{6}$/);
    }
  });

  it("tra mã không phân biệt hoa thường", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const id = await seedUser(db, {
      email: "kol@example.com",
      code: "NamDong",
      partner: true,
    });
    expect(await resolveReferrerByCode(db, "namdong")).toBe(id);
    expect(await resolveReferrerByCode(db, "NAMDONG")).toBe(id);
    expect(await resolveReferrerByCode(db, "khongco")).toBeNull();
  });
});

describe("mã giới thiệu — quyền đổi của đối tác", () => {
  it("khách thường KHÔNG được xin đổi mã", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const id = await seedUser(db, { email: "user@example.com", code: "557922" });
    await expect(
      requestReferralCodeChange(db, id, "TenRieng"),
    ).rejects.toThrow(/Chỉ đối tác\/KOL/);
  });

  it("mã sai định dạng (quá 9 ký tự / ký tự lạ) bị chặn", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const id = await seedUser(db, {
      email: "kol@example.com",
      code: "111111",
      partner: true,
    });
    await expect(requestReferralCodeChange(db, id, "dai-qua-10-ky-tu")).rejects.toThrow(
      /3–9 ký tự/,
    );
    await expect(requestReferralCodeChange(db, id, "a b")).rejects.toThrow(/3–9 ký tự/);
  });

  it("duyệt: đổi mã ngay, báo cho đối tác, mã CŨ vẫn quy về đúng người; chỉ được đổi 1 lần", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const admin = await seedUser(db, {
      email: "admin@example.com",
      code: "000001",
      role: "ADMIN",
    });
    const kol = await seedUser(db, {
      email: "kol@example.com",
      code: "222222",
      partner: true,
    });

    await requestReferralCodeChange(db, kol, "NamDong");
    const listed = await listReferralCodeRequests(db);
    expect(listed.pending).toHaveLength(1);

    await decideReferralCodeRequest(db, listed.pending[0]!.id, true, admin);

    const state = await getReferralCodeState(db, kol);
    expect(state.customizedAt).not.toBeNull();
    expect(await resolveReferrerByCode(db, "NamDong")).toBe(kol);
    // Link cũ chia sẻ trước đó vẫn dùng được — không mất "data" giới thiệu.
    expect(await resolveReferrerByCode(db, "222222")).toBe(kol);

    const notice = await query<{ type: string }>(
      db,
      "SELECT type FROM notifications WHERE user_id = $1",
      [kol],
    );
    expect(notice.rows.map((r) => r.type)).toContain("REFERRAL_CODE_APPROVED");

    // Quyền đổi chỉ MỘT lần.
    await expect(requestReferralCodeChange(db, kol, "TenKhac")).rejects.toThrow(
      /đổi 1 lần/,
    );
  });

  it("từ chối: mã giữ nguyên và đối tác vẫn còn quyền xin lại", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const admin = await seedUser(db, {
      email: "admin2@example.com",
      code: "000002",
      role: "ADMIN",
    });
    const kol = await seedUser(db, {
      email: "kol2@example.com",
      code: "333333",
      partner: true,
    });
    await requestReferralCodeChange(db, kol, "KolMoi");
    const listed = await listReferralCodeRequests(db);
    await decideReferralCodeRequest(db, listed.pending[0]!.id, false, admin);

    expect(await resolveReferrerByCode(db, "KolMoi")).toBeNull();
    const state = await getReferralCodeState(db, kol);
    expect(state.customizedAt).toBeNull();
    // Xin lại được sau khi bị từ chối.
    await requestReferralCodeChange(db, kol, "KolMoi2");
  });

  it("mã trùng người khác bị chặn ngay lúc gửi yêu cầu", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    await seedUser(db, { email: "a@example.com", code: "NamDong" });
    const kol = await seedUser(db, {
      email: "kol3@example.com",
      code: "444444",
      partner: true,
    });
    await expect(requestReferralCodeChange(db, kol, "namdong")).rejects.toThrow(
      /đã có người dùng/,
    );
  });
});

describe("mã giới thiệu — gán sau đăng ký (luồng Google)", () => {
  it("gán người giới thiệu khi chưa có; không tự giới thiệu; không ghi đè", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const referrer = await seedUser(db, { email: "ref@example.com", code: "555555" });
    const newbie = await seedUser(db, { email: "new@example.com", code: "666666" });

    expect(await applyReferralToUser(db, newbie, "555555")).toBe(true);
    const referralRow = await query(
      db,
      "SELECT 1 FROM referrals WHERE referrer_user_id = $1 AND referred_user_id = $2",
      [referrer, newbie],
    );
    expect(referralRow.rows.length).toBe(1);

    // Đã có người giới thiệu thì không ghi đè nữa.
    const other = await seedUser(db, { email: "other@example.com", code: "777777" });
    expect(await applyReferralToUser(db, newbie, "777777")).toBe(false);
    // Không tự giới thiệu chính mình.
    expect(await applyReferralToUser(db, other, "777777")).toBe(false);
  });
});
