import { afterEach, describe, expect, it } from "vitest";
import { listOrderHistory } from "../src/services/order-history.js";
import { importOrderRow } from "../src/services/order-import.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

async function seedUser(db: TestDb): Promise<string> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('history@example.com', 'history', 'ACTIVE', 'USER', 'HISTREF1')
     RETURNING id`,
  );
  return inserted.rows[0]!.id;
}

/** Mô phỏng đúng những gì `createPurchaseIntent` ghi khi bấm "Mua ngay". */
async function seedPurchaseClick(
  db: TestDb,
  userId: string,
  clickId: string,
  options: { ageDays?: number } = {},
): Promise<string> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO affiliate_links (
      user_id, platform, click_id, original_url, normalized_url,
      affiliate_url, sub_id, source, campaign, product_id, product_name,
      product_image_url, product_price_vnd, product_original_price_vnd,
      estimated_commission_vnd, estimated_cashback_vnd, buyer_cashback_percent,
      commission_source, created_at
    ) VALUES (
      $1, 'SHOPEE', $2, 'https://shopee.vn/product/1/1',
      'https://shopee.vn/product/1/1', 'https://s.shopee.vn/test',
      $3, 'app', 'instantbuy', '11', 'Tai nghe Bluetooth',
      'https://cf.shopee.vn/file/demo', 500000, 650000, 50000, 40000, 80,
      'PARTNER_API', now() - ($4::text || ' days')::interval
    ) RETURNING id`,
    [userId, clickId, `c${clickId}-app-instantbuy-v2`, options.ageDays ?? 0],
  );
  return inserted.rows[0]!.id;
}

const baseParams = {
  status: "ALL",
  released: "ALL" as const,
  searchTerm: "",
  attributionDays: 30,
};

describe("listOrderHistory — lượt bấm mua hiện ngay trong lịch sử", () => {
  it("bấm Mua ngay là có bản ghi chờ sàn xác nhận, kèm tiền hoàn dự kiến", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const userId = await seedUser(db);
    await seedPurchaseClick(db, userId, "AwaitClick01");

    const history = await listOrderHistory(db, { ...baseParams, userId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      record_kind: "INTENT",
      status: "AWAITING",
      platform_order_id: null,
      product_name: "Tai nghe Bluetooth",
      cashback_vnd: "40000",
      product_price_vnd: "500000",
      product_original_price_vnd: "650000",
    });

    // Vẫn thấy khi lọc tab "Đang chờ", nhưng không lọt vào tab đã duyệt/đã về ví.
    expect(
      await listOrderHistory(db, { ...baseParams, userId, status: "PENDING" }),
    ).toHaveLength(1);
    expect(
      await listOrderHistory(db, {
        ...baseParams,
        userId,
        status: "APPROVED",
        released: "HELD",
      }),
    ).toHaveLength(0);
    expect(
      await listOrderHistory(db, {
        ...baseParams,
        userId,
        status: "APPROVED",
        released: "RELEASED",
      }),
    ).toHaveLength(0);
  });

  it("quá hạn ghi nhận mà sàn không trả đơn thì chuyển sang không ghi nhận", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const userId = await seedUser(db);
    await seedPurchaseClick(db, userId, "StaleClick01", { ageDays: 45 });

    const history = await listOrderHistory(db, { ...baseParams, userId });
    expect(history[0]).toMatchObject({
      record_kind: "INTENT",
      status: "UNTRACKED",
    });
  });

  it("đồng bộ gán được đơn thật thì bản ghi chờ được thay bằng đơn", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const userId = await seedUser(db);
    await seedPurchaseClick(db, userId, "SyncClick01");

    await importOrderRow(
      db,
      testConfig(),
      {
        platform: "SHOPEE",
        platform_order_id: "2607302HKW67BY",
        status: "PENDING",
        order_amount_vnd: "480000",
        commission_vnd: "48000",
        sub_id: "cSyncClick01-app-instantbuy-v2",
        external_status: "PENDING",
      },
      userId,
    );

    const history = await listOrderHistory(db, { ...baseParams, userId });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      record_kind: "ORDER",
      status: "PENDING",
      platform_order_id: "2607302HKW67BY",
      cashback_vnd: "38400",
    });
  });

  it("nhiều lượt mua chưa khớp và đơn thật cùng xếp theo thời gian", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const userId = await seedUser(db);
    await seedPurchaseClick(db, userId, "OldClick01", { ageDays: 3 });
    await seedPurchaseClick(db, userId, "NewClick01");

    const history = await listOrderHistory(db, { ...baseParams, userId });
    expect(history.map((row) => row.record_kind)).toEqual([
      "INTENT",
      "INTENT",
    ]);
    expect(history[0]!.created_at.getTime()).toBeGreaterThan(
      history[1]!.created_at.getTime(),
    );
  });
});
