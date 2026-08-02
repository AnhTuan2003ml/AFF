/**
 * Seed dữ liệu demo (đơn hàng + lịch sử rút tiền) cho MỘT tài khoản cụ thể,
 * dùng để xem thử giao diện dashboard/lịch sử đơn/rút tiền có dữ liệu thật.
 *
 * Chỉ dùng cho môi trường dev/staging. Đơn hàng đi qua đúng pipeline nghiệp
 * vụ thật (importOrderRow — cùng hàm CSV đối soát dùng ở backoffice) để bút
 * toán ledger luôn cân bằng; rút tiền dùng đúng cấu trúc bảng/ledger entry
 * mà createWithdrawalFromIntent/releaseWithdrawalHold/backoffice đã dùng.
 *
 * Chạy: docker compose run --rm migrate node dist/scripts/seed-demo-user.js
 */
import { loadConfig } from "../src/config.js";
import { createDatabase, query, withTransaction } from "../src/db.js";
import { importOrderRow, type OrderImportRow } from "../src/services/order-import.js";
import { postLedgerTransaction, releaseWithdrawalHold } from "../src/services/ledger.js";

const TARGET_EMAIL = "tuankkffdnc@gmail.com";

const config = loadConfig();
const db = createDatabase(config);

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

type SeedProduct = {
  platform: OrderImportRow["platform"];
  platform_order_id: string;
  product_id: string;
  shop_id: string;
  product_name: string;
  shop_name: string;
  product_image_url: string;
  product_price_vnd: string;
  product_original_price_vnd?: string;
  original_url: string;
};

const SEED_PRODUCTS: Record<string, SeedProduct> = {
  "DEMO-SP-1001": {
    platform: "SHOPEE",
    platform_order_id: "DEMO-SP-1001",
    product_id: "anker-soundcore-life-q20",
    shop_id: "soundcore-official",
    product_name: "Tai nghe chống ồn Anker Soundcore Life Q20",
    shop_name: "Soundcore Official Store",
    product_image_url: "https://cdn.shopify.com/s/files/1/0508/6404/5245/products/A3025011_TD01_V1.png",
    product_price_vnd: "850000",
    product_original_price_vnd: "1290000",
    original_url: "https://www.soundcore.com/products/a3025",
  },
  "DEMO-TT-2001": {
    platform: "TIKTOK",
    platform_order_id: "DEMO-TT-2001",
    product_id: "laroche-posay-anthelios-spf60",
    shop_id: "laroche-posay-official",
    product_name: "Kem chống nắng La Roche-Posay Anthelios Ultra Light SPF60",
    shop_name: "La Roche-Posay Official",
    product_image_url: "https://www.laroche-posay.us/dw/image/v2/AANG_PRD/on/demandware.static/-/Sites-acd-laroche-posay-master-catalog/default/dw89d849df/img/883140012993/la-roche-posay-anthelios-lightweight-facial-sunscreen-spf60-883140012993-1.jpg?q=70&sfrm=jpg&sh=320&sm=cut&sw=320",
    product_price_vnd: "320000",
    product_original_price_vnd: "395000",
    original_url: "https://www.laroche-posay.us/anthelios-ultra-light-spf-60-sunscreen-883140012993.html",
  },
  "DEMO-LZ-3001": {
    platform: "LAZADA",
    platform_order_id: "DEMO-LZ-3001",
    product_id: "locknlock-ejf996blk",
    shop_id: "locknlock-official",
    product_name: "Nồi chiên không dầu LocknLock EJF996BLK 5.5L",
    shop_name: "LocknLock Official Store",
    product_image_url: "https://ecatalog-media.homepro.co.th/homepro/ART_IMAGE/12/233/1223343/447x447/27022024_1223343%24Imagec1.jpg",
    product_price_vnd: "1250000",
    product_original_price_vnd: "2690000",
    original_url: "https://www.homepro.co.th/p/1223343",
  },
  "DEMO-SP-1003": {
    platform: "SHOPEE",
    platform_order_id: "DEMO-SP-1003",
    product_id: "logitech-mx-master-3s",
    shop_id: "logitech-official",
    product_name: "Chuột không dây Logitech MX Master 3S",
    shop_name: "Logitech Official Store",
    product_image_url: "https://resource.logitech.com/content/dam/logitech/en/products/mice/mx-master-3s/gallery/mx-master-3s-mouse-top-view-graphite.png",
    product_price_vnd: "2100000",
    product_original_price_vnd: "2490000",
    original_url: "https://www.logitech.com/en-us/shop/p/mx-master-3s.910-006558",
  },
  "DEMO-TT-2003": {
    platform: "TIKTOK",
    platform_order_id: "DEMO-TT-2003",
    product_id: "xiaomi-smart-band-8",
    shop_id: "xiaomi-official",
    product_name: "Vòng đeo tay thông minh Xiaomi Smart Band 8",
    shop_name: "Xiaomi Official Store",
    product_image_url: "https://i01.appmifile.com/webfile/globalimg/products/pc/xiaomi-smart-band-8/specs01.png",
    product_price_vnd: "780000",
    product_original_price_vnd: "990000",
    original_url: "https://www.mi.com/global/product/xiaomi-smart-band-8/",
  },
  "DEMO-SP-1002": {
    platform: "SHOPEE",
    platform_order_id: "DEMO-SP-1002",
    product_id: "philips-ac1214-10",
    shop_id: "philips-official",
    product_name: "Máy lọc không khí Philips Series 1000i AC1214/10",
    shop_name: "Philips Official Store",
    product_image_url: "https://images.philips.com/is/image/PhilipsConsumer/AC1214_10-IMS-en_GB?$pnglarge$&wid=320",
    product_price_vnd: "599000",
    product_original_price_vnd: "899000",
    original_url: "https://www.philips.com.vn/c-p/AC1214_10/1000i-series-air-purifier",
  },
  "DEMO-TT-2002": {
    platform: "TIKTOK",
    platform_order_id: "DEMO-TT-2002",
    product_id: "anessa-perfect-uv-milk",
    shop_id: "anessa-official",
    product_name: "Sữa chống nắng Anessa Perfect UV Sunscreen Skincare Milk SPF50+",
    shop_name: "Anessa Official Store",
    product_image_url: "https://www.anessa.shiseido.co.jp/products/suncare/perfect_uv_sm/images/img_product.png",
    product_price_vnd: "199000",
    product_original_price_vnd: "350000",
    original_url: "https://www.anessa.shiseido.co.jp/products/suncare/perfect_uv_sm/",
  },
  "DEMO-LZ-3002": {
    platform: "LAZADA",
    platform_order_id: "DEMO-LZ-3002",
    product_id: "makita-cordless-grinder-body",
    shop_id: "makita-tools-store",
    product_name: "Thân máy mài pin cầm tay Makita Universal Battery-Powered",
    shop_name: "Makita Tools Store",
    product_image_url: "https://lzd-img-global.slatic.net/g/p/0fdd72147b1418cb1c8d2365c0388665.jpg_720x720q80.jpg",
    product_price_vnd: "68600",
    product_original_price_vnd: "121540",
    original_url: "https://www.lazada.vn/products/pdp-i2383196313-s13314698197.html",
  },
};

const ORDER_ROWS: OrderImportRow[] = [
  {
    platform: "SHOPEE",
    platform_order_id: "DEMO-SP-1001",
    status: "APPROVED",
    order_amount_vnd: "850000",
    commission_vnd: "42500",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(25),
  },
  {
    platform: "TIKTOK",
    platform_order_id: "DEMO-TT-2001",
    status: "APPROVED",
    order_amount_vnd: "320000",
    commission_vnd: "25600",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(18),
  },
  {
    platform: "LAZADA",
    platform_order_id: "DEMO-LZ-3001",
    status: "APPROVED",
    order_amount_vnd: "1250000",
    commission_vnd: "50000",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(12),
  },
  {
    platform: "SHOPEE",
    platform_order_id: "DEMO-SP-1003",
    status: "APPROVED",
    order_amount_vnd: "2100000",
    commission_vnd: "126000",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(7),
  },
  {
    platform: "TIKTOK",
    platform_order_id: "DEMO-TT-2003",
    status: "APPROVED",
    order_amount_vnd: "780000",
    commission_vnd: "78000",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(3),
  },
  {
    platform: "SHOPEE",
    platform_order_id: "DEMO-SP-1002",
    status: "PENDING",
    order_amount_vnd: "599000",
    commission_vnd: "29950",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(2),
  },
  {
    platform: "TIKTOK",
    platform_order_id: "DEMO-TT-2002",
    status: "PENDING",
    order_amount_vnd: "199000",
    commission_vnd: "19900",
    email: TARGET_EMAIL,
    purchased_at: daysAgo(1),
  },
];

// Đơn này cố tình đi qua PENDING trước rồi mới CANCELLED — đúng luồng đảo
// bút toán thật (reverseSplitCashback) thay vì tạo thẳng ở trạng thái hủy.
const CANCELLED_ORDER_ID = "DEMO-LZ-3002";

async function ensureSeedProductLink(
  userId: string,
  product: SeedProduct,
): Promise<string> {
  const clickId = `seed-${product.platform_order_id.toLowerCase()}`;
  const existing = await query<{ id: string }>(
    db,
    "SELECT id FROM affiliate_links WHERE click_id = $1",
    [clickId],
  );
  if (existing.rows[0]) {
    await query(
      db,
      `
        UPDATE affiliate_links
        SET product_id = $2, shop_id = $3, product_name = $4, shop_name = $5,
          product_image_url = $6, product_price_vnd = $7,
          product_original_price_vnd = NULLIF($8, '')::bigint,
          original_url = $9, normalized_url = $9, affiliate_url = $9
        WHERE click_id = $1
      `,
      [
        clickId,
        product.product_id,
        product.shop_id,
        product.product_name,
        product.shop_name,
        product.product_image_url,
        product.product_price_vnd,
        product.product_original_price_vnd ?? "",
        product.original_url,
      ],
    );
    return clickId;
  }

  await query(
    db,
    `
      INSERT INTO affiliate_links (
        user_id, platform, click_id, original_url, normalized_url,
        affiliate_url, sub_id, source, campaign, product_id, shop_id,
        product_name, shop_name, product_image_url, product_price_vnd,
        product_original_price_vnd, estimated_commission_vnd,
        estimated_cashback_vnd, buyer_cashback_percent, commission_source
      ) VALUES (
        $1, $2, $3, $4, $4, $4, $3, 'seed', 'demo-user',
        $5, $6, $7, $8, $9, $10, NULLIF($11, '')::bigint,
        NULL, NULL, NULL, 'UNAVAILABLE'
      )
    `,
    [
      userId,
      product.platform,
      clickId,
      product.original_url,
      product.product_id,
      product.shop_id,
      product.product_name,
      product.shop_name,
      product.product_image_url,
      product.product_price_vnd,
      product.product_original_price_vnd ?? "",
    ],
  );
  return clickId;
}

async function seedOrders(actorId: string): Promise<void> {
  for (const row of ORDER_ROWS) {
    const product = SEED_PRODUCTS[row.platform_order_id];
    const importRow = product
      ? { ...row, click_id: await ensureSeedProductLink(actorId, product) }
      : row;
    const result = await importOrderRow(db, config, importRow, actorId);
    console.info(`  Đơn ${row.platform_order_id}: ${result.status}`);
  }

  const cancelledProduct = SEED_PRODUCTS[CANCELLED_ORDER_ID];
  if (!cancelledProduct) {
    throw new Error(`Chưa cấu hình sản phẩm seed cho ${CANCELLED_ORDER_ID}.`);
  }
  const cancelledClickId = await ensureSeedProductLink(actorId, cancelledProduct);
  await importOrderRow(
    db,
    config,
    {
      platform: "LAZADA",
      platform_order_id: CANCELLED_ORDER_ID,
      status: "PENDING",
      order_amount_vnd: "450000",
      commission_vnd: "22500",
      email: TARGET_EMAIL,
      purchased_at: daysAgo(10),
      click_id: cancelledClickId,
    },
    actorId,
  );
  const cancelled = await importOrderRow(
    db,
    config,
    {
      platform: "LAZADA",
      platform_order_id: CANCELLED_ORDER_ID,
      status: "CANCELLED",
      order_amount_vnd: "450000",
      commission_vnd: "22500",
      email: TARGET_EMAIL,
      purchased_at: daysAgo(10),
      click_id: cancelledClickId,
    },
    actorId,
  );
  console.info(`  Đơn ${CANCELLED_ORDER_ID}: PENDING → ${cancelled.status} (đã đảo bút toán)`);
}

async function getAccountId(
  userId: string,
  code: "AVAILABLE" | "HELD",
): Promise<string> {
  const result = await query<{ id: string }>(
    db,
    "SELECT id FROM ledger_accounts WHERE owner_type = 'USER' AND owner_id = $1 AND code = $2",
    [userId, code],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Không tìm thấy ledger account ${code} cho user ${userId}.`);
  return id;
}

async function holdWithdrawal(params: {
  userId: string;
  amountVnd: number;
  bankCode: string;
  bankAccountCiphertext: string;
  bankNameCiphertext: string;
  bankLast4: string;
  requestedAt: string;
}): Promise<string> {
  return withTransaction(db, async (client) => {
    const inserted = await query<{ id: string }>(
      client,
      `
        INSERT INTO withdrawals (
          user_id, amount_vnd, bank_code, bank_account_ciphertext,
          bank_name_ciphertext, bank_last4, status, requested_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'FUNDS_HELD', $7)
        RETURNING id
      `,
      [
        params.userId,
        params.amountVnd,
        params.bankCode,
        params.bankAccountCiphertext,
        params.bankNameCiphertext,
        params.bankLast4,
        params.requestedAt,
      ],
    );
    const withdrawalId = inserted.rows[0]!.id;
    const availableId = await getAccountId(params.userId, "AVAILABLE");
    const heldId = await getAccountId(params.userId, "HELD");
    await postLedgerTransaction(client, {
      type: "WITHDRAWAL_HOLD",
      referenceType: "WITHDRAWAL",
      referenceId: withdrawalId,
      idempotencyKey: `demo:withdrawal:hold:${withdrawalId}`,
      description: "Giữ số dư cho yêu cầu rút tiền (demo)",
      entries: [
        { accountId: availableId, direction: "DEBIT", amountVnd: params.amountVnd },
        { accountId: heldId, direction: "CREDIT", amountVnd: params.amountVnd },
      ],
    });
    return withdrawalId;
  });
}

async function seedWithdrawals(userId: string): Promise<void> {
  const bank = await query<{
    bank_code: string;
    account_number_ciphertext: string;
    account_name_ciphertext: string;
    account_last4: string;
  }>(
    db,
    `
      SELECT bank_code, account_number_ciphertext, account_name_ciphertext, account_last4
      FROM user_bank_accounts
      WHERE user_id = $1 AND status = 'VERIFIED'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  const bankAccount = bank.rows[0];
  if (!bankAccount) {
    console.info("  Bỏ qua rút tiền demo: user chưa có tài khoản ngân hàng VERIFIED.");
    return;
  }

  // 1) Đang giữ chờ xử lý.
  const held = await holdWithdrawal({
    userId,
    amountVnd: 100_000,
    bankCode: bankAccount.bank_code,
    bankAccountCiphertext: bankAccount.account_number_ciphertext,
    bankNameCiphertext: bankAccount.account_name_ciphertext,
    bankLast4: bankAccount.account_last4,
    requestedAt: daysAgo(1),
  });
  console.info(`  Rút tiền ${held}: FUNDS_HELD (100.000đ)`);

  // 2) Đã duyệt (giống đúng SQL backoffice dùng khi duyệt yêu cầu rút).
  const approved = await holdWithdrawal({
    userId,
    amountVnd: 50_000,
    bankCode: bankAccount.bank_code,
    bankAccountCiphertext: bankAccount.account_number_ciphertext,
    bankNameCiphertext: bankAccount.account_name_ciphertext,
    bankLast4: bankAccount.account_last4,
    requestedAt: daysAgo(6),
  });
  await query(
    db,
    `
      UPDATE withdrawals
      SET status = 'APPROVED', decided_by = $2, decided_at = $3
      WHERE id = $1
    `,
    [approved, userId, daysAgo(5)],
  );
  console.info(`  Rút tiền ${approved}: APPROVED (50.000đ)`);

  // 3) Bị từ chối — dùng đúng hàm thật releaseWithdrawalHold (hoàn tiền lại
  // AVAILABLE), không tự bịa cách hoàn tiền riêng.
  const rejected = await holdWithdrawal({
    userId,
    amountVnd: 30_000,
    bankCode: bankAccount.bank_code,
    bankAccountCiphertext: bankAccount.account_number_ciphertext,
    bankNameCiphertext: bankAccount.account_name_ciphertext,
    bankLast4: bankAccount.account_last4,
    requestedAt: daysAgo(8),
  });
  await releaseWithdrawalHold(db, {
    withdrawalId: rejected,
    actorId: userId,
    reason: "Demo: thông tin ngân hàng cần xác minh lại.",
  });
  console.info(`  Rút tiền ${rejected}: REJECTED (30.000đ, đã hoàn lại số dư)`);
}

async function run(): Promise<void> {
  const user = await query<{ id: string }>(
    db,
    "SELECT id FROM users WHERE lower(email) = lower($1) AND status = 'ACTIVE'",
    [TARGET_EMAIL],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    throw new Error(`Không tìm thấy user ACTIVE với email ${TARGET_EMAIL}.`);
  }

  console.info(`Seed dữ liệu demo cho ${TARGET_EMAIL} (${userId})`);
  console.info("Đơn hàng:");
  await seedOrders(userId);
  console.info("Rút tiền:");
  await seedWithdrawals(userId);
  console.info("Xong.");
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
