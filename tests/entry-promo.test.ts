import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/db.js";
import {
  getEntryPromoOverview,
  resolveEntryPromo,
  setEntryPromoSelection,
  updateEntryPromoRotation,
} from "../src/services/entry-promo.js";
import { createTestDb } from "./helpers.js";

let db: Database;
let close: () => Promise<void>;
let adminId: string;

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  const admin = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('promo-admin@shoptik.vn', 'Promo Admin', 'ACTIVE', 'ADMIN', 'PROMO001')
     RETURNING id`,
  );
  adminId = admin.rows[0]!.id;
});

afterEach(async () => {
  await close();
});

async function addPromo(
  title: string,
  options: { enabled?: boolean; image?: string | null; status?: string } = {},
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `
      INSERT INTO content_items (
        type, title, description, image_url, category, status,
        entry_promo_enabled
      ) VALUES ('PRODUCT', $1, 'Mô tả', $2, 'Đề xuất', $3, $4)
      RETURNING id
    `,
    [
      title,
      options.image === undefined ? "https://example.com/product.jpg" : options.image,
      options.status ?? "PUBLISHED",
      options.enabled ?? true,
    ],
  );
  return result.rows[0]!.id;
}

describe("entry promo rotation", () => {
  it("trả null khi kho quảng cáo chưa có mục hợp lệ", async () => {
    await addPromo("Không được chọn", { enabled: false });
    await addPromo("Không có ảnh", { image: null });

    const result = await resolveEntryPromo(db, new Date("2026-09-08T00:00:00Z"));

    expect(result.promo).toBeNull();
    expect(result.rotationKey).toBeNull();
    expect(result.rotationMinutes).toBe(180);
  });

  it("giữ nguyên trong chu kỳ và đổi sang sản phẩm khác khi hết hạn", async () => {
    await addPromo("Sản phẩm A");
    await addPromo("Sản phẩm B");
    const startedAt = new Date("2026-09-08T00:00:00Z");

    const first = await resolveEntryPromo(db, startedAt);
    const withinCycle = await resolveEntryPromo(
      db,
      new Date("2026-09-08T02:59:59Z"),
    );
    const nextCycle = await resolveEntryPromo(
      db,
      new Date("2026-09-08T03:00:00Z"),
    );

    expect(first.promo).not.toBeNull();
    expect(withinCycle.promo?.id).toBe(first.promo?.id);
    expect(withinCycle.rotationKey).toBe(first.rotationKey);
    expect(nextCycle.promo?.id).not.toBe(first.promo?.id);
    expect(nextCycle.rotationKey).not.toBe(first.rotationKey);
  });

  it("cho phép admin đặt chu kỳ và chọn hoặc bỏ từng quảng cáo", async () => {
    const withImage = await addPromo("Có ảnh", { enabled: false });
    const withoutImage = await addPromo("Thiếu ảnh", {
      enabled: false,
      image: null,
    });

    await updateEntryPromoRotation(db, 120, adminId);
    expect(await setEntryPromoSelection(db, withImage, true)).toBe("UPDATED");
    expect(await setEntryPromoSelection(db, withoutImage, true)).toBe(
      "IMAGE_REQUIRED",
    );

    const overview = await getEntryPromoOverview(db);
    expect(overview.rotationMinutes).toBe(120);
    expect(overview.selectedCount).toBe(1);

    expect(await setEntryPromoSelection(db, withImage, false)).toBe("UPDATED");
    expect((await getEntryPromoOverview(db)).selectedCount).toBe(0);
  });

  it("bỏ qua mục đã ẩn dù vẫn được đánh dấu quảng cáo", async () => {
    await addPromo("Đã lưu trữ", { status: "ARCHIVED" });
    const activeId = await addPromo("Đang đăng");

    const result = await resolveEntryPromo(db, new Date("2026-09-08T00:00:00Z"));

    expect(result.promo?.id).toBe(activeId);
  });
});
