import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import {
  BEST_SELLER_LIST_TYPE,
  EXCLUSIVE_LIST_TYPE,
  claimNextHarvestJob,
  completeHarvestJob,
  createHarvestProfile,
  enqueueHarvestJob,
  enqueueOfferPageFetch,
  enqueueOfferRangeFetch,
  getCachedPageRange,
  getHarvestSettings,
  getKnownOfferPageCount,
  getStoredOfferPage,
  hasOfferPage,
  importHarvestedProducts,
  isWorkerOnline,
  parseShopeeOfferPage,
  saveOfferPage,
} from "../src/services/discover-harvest.js";
import { getBusinessConfig } from "../src/services/business-config.js";
import type { Database } from "../src/db.js";

let db: Database;
let close: () => Promise<void>;
let adminId: string;

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  const admin = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('admin@shoptik.vn', 'Admin', 'ACTIVE', 'ADMIN', 'HARVREF01')
     RETURNING id`,
  );
  adminId = admin.rows[0]!.id;
});

afterEach(async () => {
  await close();
});

function offerPayload(items: Array<Record<string, unknown>>): unknown {
  return { code: 0, msg: "success", data: { list: items } };
}

describe("parseShopeeOfferPage", () => {
  it("đọc đúng các field chuẩn của api/v3/offer/product/list", () => {
    const products = parseShopeeOfferPage(
      offerPayload([
        {
          item_id: 123456,
          item_name: "Tai nghe chống ồn",
          image: "vn-abcdef0123456789",
          // Giá micro: 19.900.000.000 / 100.000 = 199.000đ
          price_min: "19900000000",
          commission_rate: "0.055",
          shop_name: "Shop Chính Hãng",
          shop_id: 777,
          sales: 1520,
        },
      ]),
    );
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      itemId: "123456",
      name: "Tai nghe chống ồn",
      imageUrl: "https://down-vn.img.susercontent.com/file/vn-abcdef0123456789",
      priceVnd: 199_000,
      commissionRateBps: 550,
      shopName: "Shop Chính Hãng",
      productUrl: "https://shopee.vn/product/777/123456",
      salesCount: 1520,
    });
  });

  it("đọc đúng định dạng thật: dữ liệu lồng trong batch_item_for_item_card_full", () => {
    const products = parseShopeeOfferPage(
      offerPayload([
        {
          item_id: "54763467641",
          product_link: "https://shopee.vn/product/1478513228/54763467641",
          long_link: "https://shopee.vn/universal-link/product/...",
          max_commission_rate: "0%",
          seller_commission_rate: "2%",
          default_commission_rate: "5%",
          batch_item_for_item_card_full: {
            itemid: "54763467641",
            shopid: "1478513228",
            name: "Loa Harman Kardon SoundSticks 5",
            image: "vn-11134207-81ztc-mqbmitb9fgul3e",
            currency: "VND",
            sold: 11,
            historical_sold: 11,
            // Giá micro ×100.000: 639000000000 → 6.390.000đ
            price: "639000000000",
            price_min: "639000000000",
          },
        },
      ]),
    );
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      itemId: "54763467641",
      name: "Loa Harman Kardon SoundSticks 5",
      imageUrl:
        "https://down-vn.img.susercontent.com/file/vn-11134207-81ztc-mqbmitb9fgul3e",
      priceVnd: 6_390_000,
      // "Tỉ lệ hoa hồng" Shopee hiển thị = default_commission_rate 5% = 500 bps
      commissionRateBps: 500,
      productUrl: "https://shopee.vn/product/1478513228/54763467641",
      salesCount: 11,
    });
  });

  it("chịu được tên field khác và giá VND thường", () => {
    const products = parseShopeeOfferPage(
      offerPayload([
        {
          itemId: "99",
          name: "Nồi chiên",
          image_url: "https://cf.shopee.vn/file/abc.jpg",
          price: 1_250_000,
          comm_rate: "7.5",
          product_link: "https://shopee.vn/product/1/99",
        },
      ]),
    );
    expect(products[0]).toMatchObject({
      itemId: "99",
      priceVnd: 1_250_000,
      commissionRateBps: 750,
      productUrl: "https://shopee.vn/product/1/99",
    });
  });

  it("ưu đãi độc quyền (list_type=8): hoa hồng theo default_commission_rate", () => {
    // Mẫu thật từ offer_for_me: seller 25%, default 28%, giá micro.
    const products = parseShopeeOfferPage(
      offerPayload([
        {
          item_id: "43009544535",
          product_link: "https://shopee.vn/product/1539654247/43009544535",
          seller_commission_rate: "25%",
          default_commission_rate: "28%",
          batch_item_for_item_card_full: {
            itemid: "43009544535",
            shopid: "1539654247",
            name: "Camera m15 không dây",
            image: "vn-11134207-820l4-mfujk61l5cln60",
            price_min: "29500000000",
            historical_sold: 1000,
            shop_name: "CAMERA HÀNH TRÌNH",
          },
        },
      ]),
    );
    expect(products[0]).toMatchObject({
      itemId: "43009544535",
      name: "Camera m15 không dây",
      priceVnd: 295_000,
      commissionRateBps: 2800, // 28% = 2800 bps
      salesCount: 1000,
      productUrl: "https://shopee.vn/product/1539654247/43009544535",
    });
  });

  it("trả rỗng khi code khác 0 hoặc payload không hợp lệ", () => {
    expect(parseShopeeOfferPage({ code: 401, msg: "not login" })).toEqual([]);
    expect(parseShopeeOfferPage(null)).toEqual([]);
    expect(parseShopeeOfferPage("junk")).toEqual([]);
  });
});

describe("importHarvestedProducts", () => {
  it("upsert vào Khám phá với tiền hoàn = hoa hồng × tỷ lệ người mua, và ẩn hàng cũ", async () => {
    const config = testConfig();
    const businessConfig = await getBusinessConfig(db, config);
    const first = parseShopeeOfferPage(
      offerPayload([
        { item_id: 1, item_name: "Sản phẩm A", price: 100_000, commission_rate: "0.10" },
        { item_id: 2, item_name: "Sản phẩm B", price: 200_000, commission_rate: "0.05" },
      ]),
    );
    const resultA = await importHarvestedProducts(db, config, first, 60);
    expect(resultA.imported).toBe(2);

    const rows = await db.query<{
      title: string;
      cashback_rate_bps: number;
      source: string;
      status: string;
    }>(
      `SELECT title, cashback_rate_bps, source, status FROM content_items
       WHERE external_key = 'SHOPEE:1'`,
    );
    expect(rows.rows[0]).toMatchObject({
      title: "Sản phẩm A",
      source: "SHOPEE_AUTO",
      status: "PUBLISHED",
      cashback_rate_bps: Math.floor(
        (1000 * businessConfig.buyerCashbackPercent) / 100,
      ),
    });

    // Đợt sau chỉ còn sản phẩm 2 (đổi tên) — sản phẩm 1 phải bị ẩn.
    const second = parseShopeeOfferPage(
      offerPayload([
        { item_id: 2, item_name: "Sản phẩm B mới", price: 210_000, commission_rate: "0.05" },
      ]),
    );
    const resultB = await importHarvestedProducts(db, config, second, 60);
    expect(resultB.imported).toBe(1);
    expect(resultB.archived).toBe(1);

    const after = await db.query<{ external_key: string; status: string; title: string }>(
      `SELECT external_key, status, title FROM content_items
       WHERE source = 'SHOPEE_AUTO' ORDER BY external_key`,
    );
    expect(after.rows).toEqual([
      expect.objectContaining({ external_key: "SHOPEE:1", status: "ARCHIVED" }),
      expect.objectContaining({
        external_key: "SHOPEE:2",
        status: "PUBLISHED",
        title: "Sản phẩm B mới",
      }),
    ]);
  });
});

describe("hàng đợi job cho worker", () => {
  it("LOGIN thành công chuyển profile sang READY; FETCH đổ sản phẩm vào Khám phá", async () => {
    const config = testConfig();
    // id = profile id bên Browser Control, do admin dán vào form.
    const externalId = randomUUID();
    const profile = await createHarvestProfile(
      db,
      { id: externalId, name: "Tài khoản chính" },
      adminId,
    );
    expect(profile.id).toBe(externalId);
    expect(profile.status).toBe("NEEDS_LOGIN");

    // Trùng Profile ID hoặc ID không phải UUID đều bị chặn.
    await expect(
      createHarvestProfile(db, { id: externalId, name: "Bản sao" }, adminId),
    ).rejects.toMatchObject({ code: "PROFILE_EXISTS" });
    await expect(
      createHarvestProfile(db, { id: "khong-phai-uuid", name: "Sai id" }, adminId),
    ).rejects.toMatchObject({ code: "INVALID_PROFILE_ID" });

    await enqueueHarvestJob(db, profile.id, "LOGIN", adminId);
    const loginJob = await claimNextHarvestJob(db);
    expect(loginJob).toMatchObject({ kind: "LOGIN", profile_name: "Tài khoản chính" });
    await completeHarvestJob(db, config, loginJob!.id, { ok: true, loginOk: true });

    const readyProfile = await db.query<{ status: string }>(
      `SELECT status FROM harvest_profiles WHERE id = $1`,
      [profile.id],
    );
    expect(readyProfile.rows[0]!.status).toBe("READY");

    await enqueueHarvestJob(db, profile.id, "FETCH", adminId);
    const fetchJob = await claimNextHarvestJob(db);
    const result = await completeHarvestJob(db, config, fetchJob!.id, {
      ok: true,
      payloads: [
        offerPayload([
          { item_id: 5, item_name: "Máy lọc không khí", price: 599_000, commission_rate: "0.08" },
        ]),
      ],
    });
    expect(result).toMatchObject({ imported: 1 });

    const published = await db.query(
      `SELECT 1 FROM content_items
       WHERE external_key = 'SHOPEE:5' AND status = 'PUBLISHED' AND type = 'PRODUCT'`,
    );
    expect(published.rows).toHaveLength(1);

    const settings = await getHarvestSettings(db);
    expect(settings.lastStatus).toBe("SUCCESS");
    expect(settings.lastImportedCount).toBe(1);
    // claimNextHarvestJob vừa gọi nên worker được tính là online.
    expect(isWorkerOnline(settings)).toBe(true);
  });

  it("cache trang Bán chạy: enqueue trang thiếu, lưu kết quả, tái dùng", async () => {
    const config = testConfig();
    // Chưa có profile sẵn sàng → không xếp được lệnh.
    await expect(
      enqueueOfferPageFetch(db, BEST_SELLER_LIST_TYPE, 3),
    ).rejects.toMatchObject({ code: "NO_READY_PROFILE" });

    const profile = await createHarvestProfile(
      db,
      { id: randomUUID(), name: "Profile bán chạy" },
      adminId,
    );
    await enqueueHarvestJob(db, profile.id, "LOGIN", adminId);
    const login = await claimNextHarvestJob(db);
    await completeHarvestJob(db, config, login!.id, { ok: true, loginOk: true });

    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 3)).toBe(false);
    expect(await enqueueOfferPageFetch(db, BEST_SELLER_LIST_TYPE, 3)).toBe("QUEUED");
    // Cùng trang đang chờ → không xếp trùng.
    expect(await enqueueOfferPageFetch(db, BEST_SELLER_LIST_TYPE, 3)).toBe(
      "ALREADY_QUEUED",
    );

    const job = await claimNextHarvestJob(db);
    expect(job).toMatchObject({
      kind: "FETCH_PAGE",
      params: { listType: BEST_SELLER_LIST_TYPE, pageNo: 3 },
    });
    const result = await completeHarvestJob(db, config, job!.id, {
      ok: true,
      payloads: [
        offerPayload([
          { item_id: 9, item_name: "Sản phẩm bán chạy", price: 100_000, commission_rate: "0.10" },
        ]),
      ],
    });
    expect(result).toMatchObject({ imported: 1 });

    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 3)).toBe(true);
    const rows = await getStoredOfferPage(db, BEST_SELLER_LIST_TYPE, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ item_id: "9", name: "Sản phẩm bán chạy" });
    expect(await getKnownOfferPageCount(db, BEST_SELLER_LIST_TYPE)).toBe(3);
    // Sản phẩm trang Bán chạy KHÔNG đổ vào content_items (mục Đề xuất).
    const contentRows = await db.query(
      `SELECT 1 FROM content_items WHERE source = 'SHOPEE_AUTO'`,
    );
    expect(contentRows.rows).toHaveLength(0);
  });

  it("trang rỗng cũng được ghi nhận để không gọi Shopee lại", async () => {
    await saveOfferPage(db, BEST_SELLER_LIST_TYPE, 7, []);
    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 7)).toBe(true);
    expect(await getStoredOfferPage(db, BEST_SELLER_LIST_TYPE, 7)).toHaveLength(0);
  });

  it("lấy DẢI TRANG: lưu từng trang từ fromPage, báo cáo dải đã cache", async () => {
    const config = testConfig();
    const profile = await createHarvestProfile(
      db,
      { id: randomUUID(), name: "Profile dải" },
      adminId,
    );
    await enqueueHarvestJob(db, profile.id, "LOGIN", adminId);
    const login = await claimNextHarvestJob(db);
    await completeHarvestJob(db, config, login!.id, { ok: true, loginOk: true });

    // Dải quá lớn bị chặn.
    await expect(
      enqueueOfferRangeFetch(db, BEST_SELLER_LIST_TYPE, 1, 500, adminId),
    ).rejects.toMatchObject({ code: "RANGE_TOO_LARGE" });
    // Dải ngược bị chặn.
    await expect(
      enqueueOfferRangeFetch(db, BEST_SELLER_LIST_TYPE, 5, 3, adminId),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });

    const job = await enqueueOfferRangeFetch(db, BEST_SELLER_LIST_TYPE, 3, 5, adminId);
    expect(job.kind).toBe("FETCH_RANGE");
    const claimed = await claimNextHarvestJob(db);
    expect(claimed).toMatchObject({
      kind: "FETCH_RANGE",
      params: { listType: BEST_SELLER_LIST_TYPE, fromPage: 3, toPage: 5 },
    });
    // Worker trả 3 trang (3,4,5).
    await completeHarvestJob(db, config, claimed!.id, {
      ok: true,
      payloads: [
        offerPayload([{ item_id: 31, item_name: "Trang 3 SP", price: 100000, commission_rate: "0.10" }]),
        offerPayload([{ item_id: 41, item_name: "Trang 4 SP", price: 100000, commission_rate: "0.10" }]),
        offerPayload([{ item_id: 51, item_name: "Trang 5 SP", price: 100000, commission_rate: "0.10" }]),
      ],
    });

    expect((await getStoredOfferPage(db, BEST_SELLER_LIST_TYPE, 3))[0]).toMatchObject({ item_id: "31" });
    expect((await getStoredOfferPage(db, BEST_SELLER_LIST_TYPE, 4))[0]).toMatchObject({ item_id: "41" });
    expect((await getStoredOfferPage(db, BEST_SELLER_LIST_TYPE, 5))[0]).toMatchObject({ item_id: "51" });

    const range = await getCachedPageRange(db, BEST_SELLER_LIST_TYPE);
    expect(range).toMatchObject({ minPage: 3, maxPage: 5, pageCount: 3, productCount: 3 });

    // Ưu đãi độc quyền (list_type=8) là kho RIÊNG, không lẫn với Bán chạy.
    await enqueueOfferRangeFetch(db, EXCLUSIVE_LIST_TYPE, 1, 1, adminId);
    const exJob = await claimNextHarvestJob(db);
    expect(exJob).toMatchObject({ params: { listType: EXCLUSIVE_LIST_TYPE } });
    await completeHarvestJob(db, config, exJob!.id, {
      ok: true,
      payloads: [
        offerPayload([{ item_id: 99, item_name: "Ưu đãi SP", price: 100000, commission_rate: "0.28" }]),
      ],
    });
    expect(await getCachedPageRange(db, EXCLUSIVE_LIST_TYPE)).toMatchObject({
      minPage: 1,
      maxPage: 1,
      productCount: 1,
    });
    // Bán chạy vẫn nguyên (không bị ảnh hưởng bởi kho ưu đãi).
    expect((await getCachedPageRange(db, BEST_SELLER_LIST_TYPE)).productCount).toBe(3);
  });

  it("lưu tăng dần: trang được lưu ngay, job lỗi giữa chừng vẫn giữ trang trước", async () => {
    const config = testConfig();
    const profile = await createHarvestProfile(
      db,
      { id: randomUUID(), name: "Profile tăng dần" },
      adminId,
    );
    await enqueueHarvestJob(db, profile.id, "LOGIN", adminId);
    const login = await claimNextHarvestJob(db);
    await completeHarvestJob(db, config, login!.id, { ok: true, loginOk: true });

    const job = await enqueueOfferRangeFetch(db, BEST_SELLER_LIST_TYPE, 1, 5, adminId);
    const claimed = await claimNextHarvestJob(db);

    // Worker lưu trang 1,2 ngay (như /harvest/offer-page), rồi trang 3 lỗi →
    // job ERROR nhưng trang 1,2 đã nằm trong kho.
    await saveOfferPage(db, BEST_SELLER_LIST_TYPE, 1, parseShopeeOfferPage(
      offerPayload([{ item_id: 1, item_name: "P1", price: 100000, commission_rate: "0.10" }]),
    ));
    await saveOfferPage(db, BEST_SELLER_LIST_TYPE, 2, parseShopeeOfferPage(
      offerPayload([{ item_id: 2, item_name: "P2", price: 100000, commission_rate: "0.10" }]),
    ));
    // Lỗi mạng giữa chừng (không phải lỗi đăng nhập) — profile giữ trạng thái.
    await completeHarvestJob(db, config, claimed!.id, {
      ok: false,
      error: "Mất kết nối giữa chừng khi lấy trang 3.",
    });

    // Trang đã lưu vẫn còn dù job lỗi.
    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 1)).toBe(true);
    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 2)).toBe(true);
    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 3)).toBe(false);

    // Lượt sau thành công không kèm payloads (đã lưu qua endpoint) → chỉ cập
    // nhật trạng thái theo savedItems.
    const job2 = await enqueueOfferRangeFetch(db, BEST_SELLER_LIST_TYPE, 3, 3, adminId);
    const claimed2 = await claimNextHarvestJob(db);
    await saveOfferPage(db, BEST_SELLER_LIST_TYPE, 3, parseShopeeOfferPage(
      offerPayload([{ item_id: 3, item_name: "P3", price: 100000, commission_rate: "0.10" }]),
    ));
    const result = await completeHarvestJob(db, config, claimed2!.id, {
      ok: true,
      savedItems: 1,
    });
    expect(result).toMatchObject({ imported: 1 });
    expect(await hasOfferPage(db, BEST_SELLER_LIST_TYPE, 3)).toBe(true);
    const prof = await db.query<{ last_fetched_count: number; status: string }>(
      `SELECT last_fetched_count, status FROM harvest_profiles WHERE id = $1`,
      [profile.id],
    );
    expect(prof.rows[0]).toMatchObject({ last_fetched_count: 1, status: "READY" });
  });

  it("mỗi profile chỉ một lệnh chờ; lỗi 'đăng nhập' chuyển profile về NEEDS_LOGIN", async () => {
    const config = testConfig();
    const profile = await createHarvestProfile(
      db,
      { id: randomUUID(), name: "Tài khoản phụ" },
      adminId,
    );
    await enqueueHarvestJob(db, profile.id, "LOGIN", adminId);
    await expect(
      enqueueHarvestJob(db, profile.id, "FETCH", adminId),
    ).rejects.toMatchObject({ code: "JOB_ALREADY_QUEUED" });

    const job = await claimNextHarvestJob(db);
    await completeHarvestJob(db, config, job!.id, { ok: true, loginOk: true });

    await enqueueHarvestJob(db, profile.id, "FETCH", adminId);
    const fetchJob = await claimNextHarvestJob(db);
    await completeHarvestJob(db, config, fetchJob!.id, {
      ok: false,
      error: "Shopee từ chối (code=401) — profile có thể cần đăng nhập lại.",
    });
    const after = await db.query<{ status: string; last_status: string }>(
      `SELECT status, last_status FROM harvest_profiles WHERE id = $1`,
      [profile.id],
    );
    expect(after.rows[0]).toMatchObject({ status: "NEEDS_LOGIN", last_status: "ERROR" });
  });
});
