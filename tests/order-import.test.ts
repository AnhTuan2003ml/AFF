import { afterEach, describe, expect, it } from "vitest";
import {
  importOrderRow,
  normalizeOrderImportRecord,
} from "../src/services/order-import.js";
import { getWalletBalances } from "../src/services/ledger.js";
import { releaseDueCashback } from "../src/services/cashback-release.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

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

/** Giả lập đã qua thời gian giữ tiền để kiểm tra bước giải ngân. */
async function fastForwardHold(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  platformOrderId: string,
): Promise<void> {
  await db.query(
    `UPDATE orders SET cashback_available_at = now() - interval '1 minute'
     WHERE platform_order_id = $1`,
    [platformOrderId],
  );
}

async function seedDirectLink(
  db: Awaited<ReturnType<typeof createTestDb>>["db"],
  userId: string,
  clickId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO affiliate_links (
      user_id, platform, click_id, original_url, normalized_url,
      affiliate_url, sub_id, campaign
    ) VALUES (
      $1, 'SHOPEE', $2, 'https://shopee.vn/product/1/1',
      'https://shopee.vn/product/1/1', 'https://s.shopee.vn/test',
      $3, 'direct'
    )`,
    [userId, clickId, `c${clickId}-web-direct-v2`],
  );
}

describe("importOrderRow — chia hoa hồng và bất biến không trả theo click", () => {
  it("mua trực tiếp: người mua nhận đúng 80%, phần còn lại vào PLATFORM_REVENUE", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "buyer@example.com", "BUYERREF1");
    const config = testConfig();
    await seedDirectLink(db, buyerId, "DirectClick001");

    await importOrderRow(
      db,
      config,
      {
        platform_order_id: "ORDER-DIRECT-1",
        status: "APPROVED",
        order_amount_vnd: "1000000",
        commission_vnd: "100000",
        click_id: "DirectClick001",
      },
      buyerId,
    );

    // Đơn Hoàn thành vẫn phải chờ hết `cashback_hold_days` mới khả dụng.
    const heldBalances = await getWalletBalances(db, buyerId);
    expect(heldBalances.pending).toBe(80_000);
    expect(heldBalances.available).toBe(0);

    await fastForwardHold(db, "ORDER-DIRECT-1");
    await releaseDueCashback(db);

    const balances = await getWalletBalances(db, buyerId);
    expect(balances.available).toBe(80_000);
    expect(balances.pending).toBe(0);

    const platformAccount = await db.query<{ id: string }>(
      "SELECT id FROM ledger_accounts WHERE owner_type = 'SYSTEM' AND code = 'PLATFORM_REVENUE'",
    );
    const platformEntries = await db.query<{ amount_vnd: string }>(
      "SELECT amount_vnd FROM ledger_entries WHERE account_id = $1 AND direction = 'CREDIT'",
      [platformAccount.rows[0]!.id],
    );
    const totalPlatform = platformEntries.rows.reduce(
      (sum, row) => sum + Number(row.amount_vnd),
      0,
    );
    expect(totalPlatform).toBe(20_000);

    const snapshot = await db.query<{
      buyer_percent: number;
      platform_percent: number;
      sharer_percent: number;
    }>(
      `SELECT buyer_percent, platform_percent, sharer_percent
       FROM commission_entries ce
       JOIN orders o ON o.id = ce.order_id
       WHERE o.platform_order_id = 'ORDER-DIRECT-1'`,
    );
    expect(snapshot.rows[0]).toEqual({
      buyer_percent: 80,
      platform_percent: 20,
      sharer_percent: 0,
    });
  });

  it("B do A giới thiệu: mọi đơn của B, A nhận 5% hoa hồng (trực tiếp)", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const referrerId = await seedUser(db, "a-gioithieu@example.com", "REFA1");
    const buyerId = await seedUser(db, "b-duocmoi@example.com", "REFB1");
    await db.query(
      "UPDATE users SET referred_by_user_id = $1 WHERE id = $2",
      [referrerId, buyerId],
    );
    const config = testConfig();
    await seedDirectLink(db, buyerId, "ReferralClick001");

    await importOrderRow(
      db,
      config,
      {
        platform_order_id: "ORDER-REFERRED-1",
        status: "APPROVED",
        order_amount_vnd: "132000",
        commission_vnd: "10000",
        click_id: "ReferralClick001",
      },
      buyerId,
    );

    await fastForwardHold(db, "ORDER-REFERRED-1");
    await releaseDueCashback(db);

    // B nhận 80%, A (người giới thiệu) nhận 5% trực tiếp, nền tảng còn 15%.
    const buyerBalances = await getWalletBalances(db, buyerId);
    expect(buyerBalances.available).toBe(8_000);
    const referrerBalances = await getWalletBalances(db, referrerId);
    expect(referrerBalances.available).toBe(500);

    const snapshot = await db.query<{
      sharer_user_id: string;
      referral_amount_vnd: string;
      platform_amount_vnd: string;
      buyer_percent: number;
      platform_percent: number;
      sharer_percent: number;
    }>(
      `SELECT ce.sharer_user_id, ce.referral_amount_vnd::text,
        ce.platform_amount_vnd::text,
        ce.buyer_percent, ce.platform_percent, ce.sharer_percent
       FROM commission_entries ce
       JOIN orders o ON o.id = ce.order_id
       WHERE o.platform_order_id = 'ORDER-REFERRED-1'`,
    );
    expect(snapshot.rows[0]).toMatchObject({
      sharer_user_id: referrerId,
      referral_amount_vnd: "500",
      platform_amount_vnd: "1500",
      buyer_percent: 80,
      platform_percent: 15,
      sharer_percent: 5,
    });
  });

  it("mua qua link chia sẻ của người khác: 80/5/15, chủ link nhận đúng 5%", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "buyer2@example.com", "BUYERREF2");
    const sharerId = await seedUser(db, "sharer@example.com", "SHARERREF1");
    const config = testConfig();
    await seedDirectLink(db, buyerId, "ManualSharerClick01");

    await importOrderRow(
      db,
      config,
      {
        platform_order_id: "ORDER-SHARED-1",
        status: "APPROVED",
        order_amount_vnd: "1000000",
        commission_vnd: "100000",
        click_id: "ManualSharerClick01",
        sharer_email: "sharer@example.com",
      },
      buyerId,
    );

    await fastForwardHold(db, "ORDER-SHARED-1");
    await releaseDueCashback(db);

    const buyerBalances = await getWalletBalances(db, buyerId);
    const sharerBalances = await getWalletBalances(db, sharerId);
    expect(buyerBalances.available).toBe(80_000);
    expect(sharerBalances.available).toBe(5_000);

    const snapshot = await db.query<{
      buyer_percent: number;
      platform_percent: number;
      sharer_percent: number;
      sharer_user_id: string;
    }>(
      `SELECT buyer_percent, platform_percent, sharer_percent, sharer_user_id
       FROM commission_entries ce
       JOIN orders o ON o.id = ce.order_id
       WHERE o.platform_order_id = 'ORDER-SHARED-1'`,
    );
    expect(snapshot.rows[0]?.buyer_percent).toBe(80);
    expect(snapshot.rows[0]?.sharer_percent).toBe(5);
    expect(snapshot.rows[0]?.platform_percent).toBe(15);
    expect(snapshot.rows[0]?.sharer_user_id).toBe(sharerId);
  });

  it("không trả tiền chỉ dựa trên lượt click — click_event một mình không tạo bút toán nào", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const ownerId = await seedUser(db, "owner@example.com", "OWNERREF1");
    const link = await db.query<{ id: string }>(
      `INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id
      ) VALUES ($1, 'SHOPEE', 'click123', 'https://shopee.vn/x', 'https://shopee.vn/x',
        'https://s.shopee.vn/an_redir?x=1', 'sub123')
      RETURNING id`,
      [ownerId],
    );
    await db.query(
      `INSERT INTO click_events (affiliate_link_id) VALUES ($1)`,
      [link.rows[0]!.id],
    );
    await db.query(
      "UPDATE affiliate_links SET click_count = click_count + 1 WHERE id = $1",
      [link.rows[0]!.id],
    );

    const balances = await getWalletBalances(db, ownerId);
    expect(balances.pending).toBe(0);
    expect(balances.available).toBe(0);

    const anyLedgerEntry = await db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ledger_entries",
    );
    expect(Number(anyLedgerEntry.rows[0]?.count)).toBe(0);
  });

  it("đơn PENDING chưa duyệt: tiền vào PENDING chứ chưa khả dụng", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "buyer3@example.com", "BUYERREF3");
    const config = testConfig();
    await seedDirectLink(db, buyerId, "PendingClick001");

    await importOrderRow(
      db,
      config,
      {
        platform_order_id: "ORDER-PENDING-1",
        status: "PENDING",
        order_amount_vnd: "500000",
        commission_vnd: "50000",
        click_id: "PendingClick001",
      },
      buyerId,
    );

    const balances = await getWalletBalances(db, buyerId);
    expect(balances.pending).toBe(40_000);
    expect(balances.available).toBe(0);
  });
});


describe("importOrderRow — đối soát bằng mã người mua + mã sản phẩm", () => {
  async function seedProductLink(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    userId: string,
    clickId: string,
    productId: string,
  ): Promise<void> {
    await db.query(
      `INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, source, campaign, product_id, product_name,
        product_price_vnd
      ) VALUES (
        $1, 'SHOPEE', $2, 'https://shopee.vn/product/1/1',
        'https://shopee.vn/product/1/1', 'https://s.shopee.vn/x',
        $3, 'app', 'instantbuy', $4, 'Combo chân gà rút xương', 132995
      )`,
      [userId, clickId, `c${clickId}-app-instantbuy`, productId],
    );
  }

  async function trackingCodeOf(
    db: Awaited<ReturnType<typeof createTestDb>>["db"],
    userId: string,
  ): Promise<string> {
    const result = await db.query<{ tracking_code: string }>(
      "SELECT tracking_code FROM users WHERE id = $1",
      [userId],
    );
    return result.rows[0]!.tracking_code;
  }

  it("mã lượt click bị sàn cắt mất, vẫn gán đúng người mua nhờ u+p", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "up-buyer@example.com", "UPBUYER1");
    await seedProductLink(db, buyerId, "LostClick001", "43508358436");
    const code = await trackingCodeOf(db, buyerId);

    await importOrderRow(
      db,
      testConfig(),
      {
        platform: "SHOPEE",
        platform_order_id: "ORDER-UP-1",
        status: "PENDING",
        order_amount_vnd: "132995",
        commission_vnd: "17953",
        // Shopee chỉ trả về phần đuôi Sub ID, mất hẳn mảnh c<clickId>.
        sub_id: `u${code}-p43508358436-app-instantbuy`,
        purchased_at: new Date().toISOString(),
      },
      buyerId,
    );

    const order = await db.query<{
      user_id: string;
      evidence_status: string;
      attribution_value: string;
    }>(
      `SELECT user_id, evidence_status, attribution_value
       FROM orders WHERE platform_order_id = 'ORDER-UP-1'`,
    );
    expect(order.rows[0]).toMatchObject({
      user_id: buyerId,
      evidence_status: "VERIFIED",
      attribution_value: `u${code}-p43508358436`,
    });
    expect((await getWalletBalances(db, buyerId)).pending).toBe(14_362);
  });

  it("mã người mua đúng nhưng sản phẩm khác thì không gán bừa", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "up-wrong@example.com", "UPBUYER2");
    await seedProductLink(db, buyerId, "OtherClick01", "11111111");
    const code = await trackingCodeOf(db, buyerId);

    await expect(
      importOrderRow(
        db,
        testConfig(),
        {
          platform: "SHOPEE",
          platform_order_id: "ORDER-UP-2",
          status: "PENDING",
          order_amount_vnd: "100000",
          commission_vnd: "10000",
          sub_id: `u${code}-p99999999-app-instantbuy`,
        },
        buyerId,
      ),
    ).rejects.toThrow(/Không tìm thấy link ShopTik/);
  });

  it("một lượt bấm mua chỉ nhận đúng một đơn", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = testConfig();
    const buyerId = await seedUser(db, "up-once@example.com", "UPBUYER3");
    await seedProductLink(db, buyerId, "OnceClick001", "43508358436");
    const code = await trackingCodeOf(db, buyerId);
    const row = {
      platform: "SHOPEE" as const,
      status: "PENDING" as const,
      order_amount_vnd: "132995",
      commission_vnd: "17953",
      sub_id: `u${code}-p43508358436-app-instantbuy`,
    };

    await importOrderRow(
      db,
      config,
      { ...row, platform_order_id: "ORDER-UP-3A" },
      buyerId,
    );
    // Đơn thứ hai cùng sản phẩm: lượt bấm mua kia đã có đơn nên không tái sử dụng.
    await expect(
      importOrderRow(
        db,
        config,
        { ...row, platform_order_id: "ORDER-UP-3B" },
        buyerId,
      ),
    ).rejects.toThrow(/Không tìm thấy link ShopTik/);
  });

  it("mã sản phẩm lấy từ danh sách mặt hàng của báo cáo cũng dùng để đối soát", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "up-items@example.com", "UPBUYER4");
    await seedProductLink(db, buyerId, "ItemsClick01", "43508358436");
    const code = await trackingCodeOf(db, buyerId);

    await importOrderRow(
      db,
      testConfig(),
      {
        platform: "SHOPEE",
        platform_order_id: "ORDER-UP-4",
        status: "PENDING",
        order_amount_vnd: "132995",
        commission_vnd: "17953",
        // Sub ID chỉ còn mã người mua; mã sản phẩm đến từ mặt hàng của đơn.
        sub_id: `u${code}-app-instantbuy`,
        items: [
          {
            item_id: "43508358436",
            item_name: "Combo chân gà rút xương",
            quantity: 1,
            amount_vnd: 132995,
          },
        ],
      },
      buyerId,
    );

    const order = await db.query<{ user_id: string; evidence_status: string }>(
      `SELECT user_id, evidence_status FROM orders
       WHERE platform_order_id = 'ORDER-UP-4'`,
    );
    expect(order.rows[0]).toMatchObject({
      user_id: buyerId,
      evidence_status: "VERIFIED",
    });
  });
});

describe("importOrderRow — định vị tài khoản bằng Shopee Sub ID", () => {
  it("chuẩn hóa cột báo cáo Shopee và trạng thái về cấu trúc nội bộ", () => {
    expect(
      normalizeOrderImportRecord({
        "Order ID": "250731ABC123",
        "Order Status": "Completed",
        "Net Sales": "1,250,000",
        "Estimated Commission": "50,000.00",
        "Sub ID 1": "cTrackABC123",
        "Product Name": "Tai nghe Bluetooth",
      }),
    ).toMatchObject({
      platform_order_id: "250731ABC123",
      status: "APPROVED",
      order_amount_vnd: "1,250,000",
      commission_vnd: "50,000.00",
      sub_id1: "cTrackABC123",
      item_name: "Tai nghe Bluetooth",
    });
  });

  it("đối chiếu Sub ID đầy đủ, gán đúng user/link và cộng tiền chờ", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "sub-buyer@example.com", "SUBBUYER1");
    const link = await db.query<{ id: string }>(
      `INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, campaign, product_id, product_name,
        product_image_url, product_price_vnd
      ) VALUES (
        $1, 'SHOPEE', 'TrackABC123', 'https://shopee.vn/product/1/2',
        'https://shopee.vn/product/1/2', 'https://s.shopee.vn/demo',
        'cTrackABC123-web-direct-v2', 'direct', '2', 'Tai nghe Bluetooth',
        'https://cf.shopee.vn/file/demo', 500000
      ) RETURNING id`,
      [buyerId],
    );

    await importOrderRow(
      db,
      testConfig(),
      {
        platform_order_id: "ORDER-SUB-1",
        status: "PENDING",
        order_amount_vnd: "500000.00",
        commission_vnd: "50000.00",
        sub_id: "cTrackABC123-web-direct-v2",
        purchased_at: "2026-07-31T10:00:00.000Z",
      },
      buyerId,
    );

    const order = await db.query<{
      user_id: string;
      affiliate_link_id: string;
      attribution_method: string;
      attribution_value: string;
    }>(
      `SELECT user_id, affiliate_link_id, attribution_method, attribution_value
       FROM orders WHERE platform_order_id = 'ORDER-SUB-1'`,
    );
    expect(order.rows[0]).toMatchObject({
      user_id: buyerId,
      affiliate_link_id: link.rows[0]!.id,
      attribution_method: "SUB_ID",
      attribution_value: "cTrackABC123-web-direct-v2",
    });

    const balances = await getWalletBalances(db, buyerId);
    expect(balances.pending).toBe(40_000);
    expect(balances.available).toBe(0);

    const item = await db.query<{
      item_name: string;
      source: string;
      amount_vnd: string;
    }>(
      `SELECT item_name, source, amount_vnd::text
       FROM order_items WHERE order_id = (
         SELECT id FROM orders WHERE platform_order_id = 'ORDER-SUB-1'
       )`,
    );
    expect(item.rows[0]).toEqual({
      item_name: "Tai nghe Bluetooth",
      source: "CLICK_SNAPSHOT",
      amount_vnd: "500000",
    });
  });

  it("đối chiếu Sub ID 1 dạng c+clickId và ưu tiên mặt hàng thật từ báo cáo", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "sub1-buyer@example.com", "SUBBUYER2");
    await db.query(
      `INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, campaign, product_id, product_name, product_price_vnd
      ) VALUES (
        $1, 'SHOPEE', 'ClickSeparate01', 'https://shopee.vn/product/2/3',
        'https://shopee.vn/product/2/3', 'https://s.shopee.vn/demo2',
        'cClickSeparate01-web-direct-v2', 'direct', '3', 'Sản phẩm đã bấm', 120000
      )`,
      [buyerId],
    );

    await importOrderRow(
      db,
      testConfig(),
      {
        platform_order_id: "ORDER-SUB-2",
        status: "PENDING",
        order_amount_vnd: "150000",
        commission_vnd: "10000",
        sub_id1: "cClickSeparate01",
        item_id: "REAL-ITEM-99",
        item_name: "Sản phẩm thực tế trong báo cáo",
        quantity: "2",
        item_amount_vnd: "150000",
      },
      buyerId,
    );

    const order = await db.query<{ attribution_method: string }>(
      "SELECT attribution_method FROM orders WHERE platform_order_id = 'ORDER-SUB-2'",
    );
    expect(order.rows[0]?.attribution_method).toBe("SUB_ID");
    const item = await db.query<{
      external_item_key: string;
      item_name: string;
      quantity: number;
      source: string;
    }>(
      `SELECT external_item_key, item_name, quantity, source
       FROM order_items WHERE order_id = (
         SELECT id FROM orders WHERE platform_order_id = 'ORDER-SUB-2'
       )`,
    );
    expect(item.rows[0]).toEqual({
      external_item_key: "REAL-ITEM-99",
      item_name: "Sản phẩm thực tế trong báo cáo",
      quantity: 2,
      source: "REPORT",
    });
  });

  it("link chia sẻ không đủ bằng chứng để xác định tài khoản người nhận link", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const sharerId = await seedUser(db, "owner-share@example.com", "SHAREOWNER");
    const buyerId = await seedUser(db, "buyer-share@example.com", "SHAREBUYER");
    await db.query(
      `INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, campaign, product_name
      ) VALUES (
        $1, 'SHOPEE', 'ShareClick001', 'https://shopee.vn/product/9/9',
        'https://shopee.vn/product/9/9', 'https://s.shopee.vn/share',
        'cShareClick001-share-sharelink-v2', 'sharelink', 'Chuột không dây'
      )`,
      [sharerId],
    );

    await expect(
      importOrderRow(
        db,
        testConfig(),
        {
          platform_order_id: "ORDER-SHARE-SUB-1",
          status: "PENDING",
          order_amount_vnd: "200000",
          commission_vnd: "10000",
          sub_id1: "cShareClick001",
          email: "buyer-share@example.com",
        },
        buyerId,
      ),
    ).rejects.toThrow(/không chứng minh tài khoản người nhận link/);
  });

  it("không đoán người mua của link chia sẻ khi báo cáo thiếu email", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const sharerId = await seedUser(db, "share-no-buyer@example.com", "SHARENOBUY");
    await db.query(
      `INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, campaign
      ) VALUES (
        $1, 'SHOPEE', 'ShareNoBuyer01', 'https://shopee.vn/product/8/8',
        'https://shopee.vn/product/8/8', 'https://s.shopee.vn/share2',
        'cShareNoBuyer01-share-sharelink-v2', 'sharelink'
      )`,
      [sharerId],
    );

    await expect(
      importOrderRow(
        db,
        testConfig(),
        {
          platform_order_id: "ORDER-SHARE-NO-BUYER",
          status: "PENDING",
          order_amount_vnd: "100000",
          commission_vnd: "10000",
          sub_id1: "cShareNoBuyer01",
        },
        sharerId,
      ),
    ).rejects.toThrow(/không chứng minh tài khoản người nhận link/);
  });

  it("không rơi về email khi báo cáo có Sub ID lạ để tránh cộng nhầm tiền", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "fallback@example.com", "NOFALLBACK");

    await expect(
      importOrderRow(
        db,
        testConfig(),
        {
          platform_order_id: "ORDER-UNKNOWN-SUB",
          status: "PENDING",
          order_amount_vnd: "100000",
          commission_vnd: "10000",
          sub_id1: "cUnknownTracking999",
          email: "fallback@example.com",
        },
        buyerId,
      ),
    ).rejects.toThrow(/Không tìm thấy link ShopTik/);
  });
  it("Shopee không cho phép nhận diện người mua chỉ bằng email", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const buyerId = await seedUser(db, "email-only@example.com", "EMAILONLY");

    await expect(
      importOrderRow(
        db,
        testConfig(),
        {
          platform_order_id: "ORDER-EMAIL-ONLY",
          status: "PENDING",
          order_amount_vnd: "100000",
          commission_vnd: "10000",
          email: "email-only@example.com",
        },
        buyerId,
      ),
    ).rejects.toThrow(/chưa có Sub ID\/Click ID/);
  });

});
