import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { releaseDueCashback } from "../src/services/cashback-release.js";
import { getWalletBalances } from "../src/services/ledger.js";
import { importOrderRow } from "../src/services/order-import.js";
import {
  parseShopeeReportOrders,
  shopeeAmountToVnd,
} from "../src/services/shopee-report.js";
import { toOrderImportRow } from "../src/services/shopee-order-sync.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

/**
 * Bản sao báo cáo thật của Shopee (đã ẩn danh affiliate_id/affiliate_name).
 * Không đọc từ `secrets/` vì thư mục đó không nằm trong repo.
 */
async function loadSampleReport(): Promise<unknown[]> {
  const file = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "shopee-report.sample.json",
  );
  const payload = JSON.parse(await readFile(file, "utf8")) as {
    data: { list: unknown[] };
  };
  return payload.data.list;
}

async function seedUser(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  email: string,
  referralCode: string,
): Promise<string> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ($1, $2, 'ACTIVE', 'USER', $3) RETURNING id`,
    [email, email, referralCode],
  );
  return inserted.rows[0]!.id;
}

async function seedLink(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  userId: string,
  clickId: string,
  subId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO affiliate_links (
      user_id, platform, click_id, original_url, normalized_url,
      affiliate_url, sub_id, campaign
    ) VALUES (
      $1, 'SHOPEE', $2, 'https://shopee.vn/product/1/1',
      'https://shopee.vn/product/1/1', 'https://s.shopee.vn/test',
      $3, 'instantbuy'
    )`,
    [userId, clickId, subId],
  );
}

describe("parseShopeeReportOrders — chuẩn hóa báo cáo chuyển đổi Shopee", () => {
  it("quy đổi số tiền micro về VND nguyên, làm tròn xuống", () => {
    expect(shopeeAmountToVnd(19_850_000_000)).toBe(198_500);
    expect(shopeeAmountToVnd(1_795_432_500)).toBe(17_954);
    expect(shopeeAmountToVnd(0)).toBe(0);
    expect(shopeeAmountToVnd("1795432500")).toBe(17_954);
  });

  it("tách đúng đơn Hoàn thành và đơn Đã hủy từ file báo cáo thật", async () => {
    const orders = parseShopeeReportOrders(await loadSampleReport());
    expect(orders).toHaveLength(2);

    const completed = orders.find((order) => order.orderSn === "2607302HKW67BY");
    expect(completed).toMatchObject({
      status: "APPROVED",
      externalStatus: "COMPLETED",
      subId: "caPNWK0OLue5WzcT-app-instantbuy-v2",
      orderAmountVnd: 132_995,
      commissionVnd: 17_953,
    });
    expect(completed?.completedAt).toBe(
      new Date(1_785_746_161 * 1000).toISOString(),
    );
    expect(completed?.items[0]).toMatchObject({
      itemId: "43508358436",
      quantity: 1,
    });

    const cancelled = orders.find((order) => order.orderSn === "2607290KJ40E09");
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      externalStatus: "CANCEL",
      cancelReason: "Shipment failed",
      commissionVnd: 0,
      completedAt: null,
    });
    // Đơn hủy vẫn giữ tên/giá sản phẩm để hiển thị trong lịch sử đơn hàng.
    expect(cancelled?.items[0]?.amountVnd).toBe(316_000);
  });
});

describe("Đồng bộ Shopee → lịch sử đơn hàng và ví", () => {
  it("gán đơn về đúng người mua qua utm_content và giữ tiền tới hạn", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "shopee-buyer@example.com", "SHOPEEBUY1");
    // Click ID thật có ký tự "-"; Shopee lược bỏ khi ghép utm_content.
    await seedLink(
      db,
      buyerId,
      "aPNW-K0OLue5WzcT",
      "caPNWK0OLue5WzcT-app-instantbuy-v2",
    );

    const orders = parseShopeeReportOrders(await loadSampleReport());
    const completed = orders.find(
      (order) => order.orderSn === "2607302HKW67BY",
    )!;
    await importOrderRow(
      db,
      testConfig(),
      toOrderImportRow(completed),
      buyerId,
    );

    const saved = await db.query<{
      user_id: string;
      status: string;
      external_status: string;
      commission_vnd: string;
      cashback_vnd: string;
      evidence_status: string;
      completed_at: Date | null;
      cashback_available_at: Date | null;
      cashback_released_at: Date | null;
    }>(
      `SELECT user_id, status, external_status, commission_vnd::text,
        cashback_vnd::text, evidence_status, completed_at,
        cashback_available_at, cashback_released_at
       FROM orders WHERE platform_order_id = '2607302HKW67BY'`,
    );
    expect(saved.rows[0]).toMatchObject({
      user_id: buyerId,
      status: "APPROVED",
      external_status: "COMPLETED",
      commission_vnd: "17953",
      cashback_vnd: "14362",
      evidence_status: "VERIFIED",
    });
    expect(saved.rows[0]?.cashback_released_at).toBeNull();
    // Hạn giải ngân = mốc Hoàn thành + cashback_hold_days (30 ngày ở test).
    const availableAt = saved.rows[0]!.cashback_available_at!.getTime();
    const completedAt = saved.rows[0]!.completed_at!.getTime();
    expect(Math.round((availableAt - completedAt) / 86_400_000)).toBe(30);

    const held = await getWalletBalances(db, buyerId);
    expect(held.pending).toBe(14_362);
    expect(held.available).toBe(0);

    const item = await db.query<{ item_name: string; source: string }>(
      `SELECT item_name, source FROM order_items WHERE order_id = (
        SELECT id FROM orders WHERE platform_order_id = '2607302HKW67BY'
      )`,
    );
    expect(item.rows[0]?.source).toBe("REPORT");
    expect(item.rows[0]?.item_name).toContain("chân gà rút xương");

    await db.query(
      `UPDATE orders SET cashback_available_at = now() - interval '1 minute'
       WHERE platform_order_id = '2607302HKW67BY'`,
    );
    const release = await releaseDueCashback(db);
    expect(release.released).toBe(1);

    const afterRelease = await getWalletBalances(db, buyerId);
    expect(afterRelease.available).toBe(14_362);
    expect(afterRelease.pending).toBe(0);

    // Chạy lại không được cộng tiền lần hai.
    await releaseDueCashback(db);
    expect((await getWalletBalances(db, buyerId)).available).toBe(14_362);
  });

  it("đơn chuyển sang Đã hủy thì đảo khoản và lưu lý do hủy", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = testConfig();
    const buyerId = await seedUser(db, "cancel-buyer@example.com", "CANCELBUY1");
    await seedLink(
      db,
      buyerId,
      "cxK3FCTxHpaYsWYe",
      "cxK3FCTxHpaYsWYe-app-instantbuy-v2",
    );

    await importOrderRow(
      db,
      config,
      {
        platform: "SHOPEE",
        platform_order_id: "2607290KJ40E09",
        status: "PENDING",
        order_amount_vnd: "251600",
        commission_vnd: "10000",
        sub_id: "cxK3FCTxHpaYsWYe-app-instantbuy-v2",
        external_status: "PENDING",
      },
      buyerId,
    );
    expect((await getWalletBalances(db, buyerId)).pending).toBe(8_000);

    const orders = parseShopeeReportOrders(await loadSampleReport());
    const cancelled = orders.find(
      (order) => order.orderSn === "2607290KJ40E09",
    )!;
    await importOrderRow(db, config, toOrderImportRow(cancelled), buyerId);

    const balances = await getWalletBalances(db, buyerId);
    expect(balances.pending).toBe(0);
    expect(balances.available).toBe(0);

    const saved = await db.query<{
      status: string;
      cancel_reason: string | null;
      external_status: string | null;
    }>(
      `SELECT status, cancel_reason, external_status
       FROM orders WHERE platform_order_id = '2607290KJ40E09'`,
    );
    expect(saved.rows[0]).toMatchObject({
      status: "CANCELLED",
      cancel_reason: "Shipment failed",
      external_status: "CANCEL",
    });
    const entry = await db.query<{ status: string }>(
      `SELECT ce.status FROM commission_entries ce
       JOIN orders o ON o.id = ce.order_id
       WHERE o.platform_order_id = '2607290KJ40E09'`,
    );
    expect(entry.rows[0]?.status).toBe("REVERSED");
  });

  it("sàn cập nhật lại hoa hồng khi đơn còn chờ: đảo khoản cũ, ghi khoản mới", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = testConfig();
    const buyerId = await seedUser(db, "revise@example.com", "REVISEBUY1");
    await seedLink(db, buyerId, "ReviseClick01", "cReviseClick01-web-direct-v2");

    await importOrderRow(
      db,
      config,
      {
        platform_order_id: "ORDER-REVISE-1",
        status: "PENDING",
        order_amount_vnd: "500000",
        commission_vnd: "50000",
        sub_id: "cReviseClick01-web-direct-v2",
      },
      buyerId,
    );
    expect((await getWalletBalances(db, buyerId)).pending).toBe(40_000);

    await importOrderRow(
      db,
      config,
      {
        platform_order_id: "ORDER-REVISE-1",
        status: "PENDING",
        order_amount_vnd: "300000",
        commission_vnd: "30000",
        sub_id: "cReviseClick01-web-direct-v2",
      },
      buyerId,
    );

    const balances = await getWalletBalances(db, buyerId);
    expect(balances.pending).toBe(24_000);
    expect(balances.available).toBe(0);

    const entry = await db.query<{ user_amount_vnd: string; status: string }>(
      `SELECT ce.user_amount_vnd::text, ce.status FROM commission_entries ce
       JOIN orders o ON o.id = ce.order_id
       WHERE o.platform_order_id = 'ORDER-REVISE-1'`,
    );
    expect(entry.rows[0]).toMatchObject({
      user_amount_vnd: "24000",
      status: "PENDING",
    });
  });
});
