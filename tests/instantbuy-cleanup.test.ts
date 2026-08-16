import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import { pruneUnconfirmedInstantBuys } from "../src/services/instantbuy-cleanup.js";
import type { Database } from "../src/db.js";

let db: Database;
let close: () => Promise<void>;
let userId: string;

async function insertLink(opts: {
  clickId: string;
  campaign: string;
  ageDays: number;
}): Promise<string> {
  const result = await db.query<{ id: string }>(
    `
      INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, campaign, product_name, created_at
      ) VALUES (
        $1, 'SHOPEE', $2, 'https://shopee.vn/x', 'https://shopee.vn/x',
        'https://s.shopee.vn/x', 'sub', $3, 'Sản phẩm test',
        now() - ($4::text || ' days')::interval
      ) RETURNING id
    `,
    [userId, opts.clickId, opts.campaign, opts.ageDays],
  );
  return result.rows[0]!.id;
}

async function attachOrder(linkId: string, orderSn: string): Promise<void> {
  await db.query(
    `
      INSERT INTO orders (
        user_id, affiliate_link_id, platform, platform_order_id, status,
        order_amount_vnd, commission_vnd, cashback_vnd
      ) VALUES ($1, $2, 'SHOPEE', $3, 'PENDING', 100000, 5000, 4000)
    `,
    [userId, linkId, orderSn],
  );
}

async function exists(linkId: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM affiliate_links WHERE id = $1`, [linkId]);
  return r.rows.length > 0;
}

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  const user = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('khach@shoptik.vn', 'Khach', 'ACTIVE', 'USER', 'IBCLEAN01')
     RETURNING id`,
  );
  userId = user.rows[0]!.id;
});

afterEach(async () => {
  await close();
});

describe("pruneUnconfirmedInstantBuys", () => {
  it("xóa lượt mua quá hạn chưa có đơn; giữ lượt mới, lượt đã có đơn, và link không phải instantbuy", async () => {
    const config = testConfig(); // INSTANTBUY_KEEP_DAYS = 1
    const staleNoOrder = await insertLink({ clickId: "a", campaign: "instantbuy", ageDays: 2 });
    const freshNoOrder = await insertLink({ clickId: "b", campaign: "instantbuy", ageDays: 0 });
    const staleWithOrder = await insertLink({ clickId: "c", campaign: "instantbuy", ageDays: 2 });
    await attachOrder(staleWithOrder, "SP-C-1");
    const staleOtherCampaign = await insertLink({ clickId: "d", campaign: "direct", ageDays: 2 });

    const removed = await pruneUnconfirmedInstantBuys(db, config);
    expect(removed).toBe(1);

    expect(await exists(staleNoOrder)).toBe(false); // quá hạn, chưa có đơn → xóa
    expect(await exists(freshNoOrder)).toBe(true); // còn trong hạn 1 ngày
    expect(await exists(staleWithOrder)).toBe(true); // đã có đơn → giữ
    expect(await exists(staleOtherCampaign)).toBe(true); // không phải instantbuy
  });

  it("không xóa gì khi mọi lượt mua còn trong hạn", async () => {
    const link = await insertLink({ clickId: "e", campaign: "instantbuy", ageDays: 0 });
    expect(await pruneUnconfirmedInstantBuys(db, testConfig())).toBe(0);
    expect(await exists(link)).toBe(true);
  });

  it("chép sản phẩm + Sub ID sang viewed_products trước khi xóa", async () => {
    const link = await insertLink({ clickId: "f", campaign: "instantbuy", ageDays: 2 });
    await pruneUnconfirmedInstantBuys(db, testConfig());
    expect(await exists(link)).toBe(false); // đã gỡ khỏi lịch sử chờ

    const archived = await db.query<{
      product_name: string;
      sub_id: string;
      click_id: string;
      product_url: string;
    }>(
      `SELECT product_name, sub_id, click_id, product_url
       FROM viewed_products WHERE user_id = $1`,
      [userId],
    );
    expect(archived.rows.length).toBe(1);
    expect(archived.rows[0]!.product_name).toBe("Sản phẩm test");
    expect(archived.rows[0]!.sub_id).toBe("sub");
    expect(archived.rows[0]!.click_id).toBe("f");
    expect(archived.rows[0]!.product_url).toBe("https://shopee.vn/x");
  });
});
