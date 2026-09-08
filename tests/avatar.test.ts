import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { query, type Database } from "../src/db.js";
import {
  getUserAvatar,
  removeUserAvatar,
  saveUserAvatarFromField,
} from "../src/services/avatar.js";
import { createTestDb } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function seedUser(db: Database): Promise<string> {
  const r = await query<{ id: string }>(
    db,
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('a@example.com', 'A', 'ACTIVE', 'USER', '123456') RETURNING id`,
  );
  return r.rows[0]!.id;
}

describe("avatar", () => {
  it("lưu ảnh → cập nhật avatar_url tuyệt đối, tải lại là JPEG, gỡ được", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const id = await seedUser(db);
    const png = await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .png()
      .toBuffer();

    const { url } = await saveUserAvatarFromField(
      db,
      "https://shoptikvn.com",
      id,
      png,
    );
    expect(url).toMatch(new RegExp(`^https://shoptikvn.com/avatar/${id}\\?v=`));

    const row = await query<{ avatar_url: string }>(
      db,
      "SELECT avatar_url FROM users WHERE id = $1",
      [id],
    );
    expect(row.rows[0]?.avatar_url).toBe(url);

    const stored = await getUserAvatar(db, id);
    expect(stored?.contentType).toBe("image/jpeg");
    expect(stored?.data.length ?? 0).toBeGreaterThan(0);
    // Magic bytes JPEG.
    expect(stored?.data[0]).toBe(0xff);
    expect(stored?.data[1]).toBe(0xd8);

    await removeUserAvatar(db, id);
    expect(await getUserAvatar(db, id)).toBeNull();
    const after = await query<{ avatar_url: string }>(
      db,
      "SELECT avatar_url FROM users WHERE id = $1",
      [id],
    );
    expect(after.rows[0]?.avatar_url).toBe("");
  });

  it("từ chối tệp không phải ảnh", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const id = await seedUser(db);
    await expect(
      saveUserAvatarFromField(db, "https://x", id, Buffer.from("khong phai anh")),
    ).rejects.toThrow(/tệp ảnh/);
  });
});
