import { loadConfig } from "../src/config.js";
import { createDatabase, query } from "../src/db.js";

const TARGET_EMAIL = "tuankkffdnc@gmail.com";

const products = [
  {
    platformOrderId: "DEMO-SP-1001",
    platform: "SHOPEE",
    productId: "anker-soundcore-life-q20",
    shopId: "soundcore-official",
    productName: "Tai nghe ch\u1ed1ng \u1ed3n Anker Soundcore Life Q20",
    shopName: "Soundcore Official Store",
    imageUrl: "https://cdn.shopify.com/s/files/1/0508/6404/5245/products/A3025011_TD01_V1.png",
    priceVnd: 850_000,
    originalPriceVnd: 1_290_000,
    originalUrl: "https://www.soundcore.com/products/a3025",
  },
  {
    platformOrderId: "DEMO-TT-2001",
    platform: "TIKTOK",
    productId: "laroche-posay-anthelios-spf60",
    shopId: "laroche-posay-official",
    productName: "Kem ch\u1ed1ng n\u1eafng La Roche-Posay Anthelios Ultra Light SPF60",
    shopName: "La Roche-Posay Official",
    imageUrl: "https://www.laroche-posay.us/dw/image/v2/AANG_PRD/on/demandware.static/-/Sites-acd-laroche-posay-master-catalog/default/dw89d849df/img/883140012993/la-roche-posay-anthelios-lightweight-facial-sunscreen-spf60-883140012993-1.jpg?q=70&sfrm=jpg&sh=320&sm=cut&sw=320",
    priceVnd: 320_000,
    originalPriceVnd: 395_000,
    originalUrl: "https://www.laroche-posay.us/anthelios-ultra-light-spf-60-sunscreen-883140012993.html",
  },
  {
    platformOrderId: "DEMO-LZ-3001",
    platform: "LAZADA",
    productId: "locknlock-ejf996blk",
    shopId: "locknlock-official",
    productName: "N\u1ed3i chi\u00ean kh\u00f4ng d\u1ea7u LocknLock EJF996BLK 5.5L",
    shopName: "LocknLock Official Store",
    imageUrl: "https://ecatalog-media.homepro.co.th/homepro/ART_IMAGE/12/233/1223343/447x447/27022024_1223343%24Imagec1.jpg",
    priceVnd: 1_250_000,
    originalPriceVnd: 2_690_000,
    originalUrl: "https://www.homepro.co.th/p/1223343",
  },
  {
    platformOrderId: "DEMO-SP-1003",
    platform: "SHOPEE",
    productId: "logitech-mx-master-3s",
    shopId: "logitech-official",
    productName: "Chu\u1ed9t kh\u00f4ng d\u00e2y Logitech MX Master 3S",
    shopName: "Logitech Official Store",
    imageUrl: "https://resource.logitech.com/content/dam/logitech/en/products/mice/mx-master-3s/gallery/mx-master-3s-mouse-top-view-graphite.png",
    priceVnd: 2_100_000,
    originalPriceVnd: 2_490_000,
    originalUrl: "https://www.logitech.com/en-us/shop/p/mx-master-3s.910-006558",
  },
  {
    platformOrderId: "DEMO-TT-2003",
    platform: "TIKTOK",
    productId: "xiaomi-smart-band-8",
    shopId: "xiaomi-official",
    productName: "V\u00f2ng \u0111eo tay th\u00f4ng minh Xiaomi Smart Band 8",
    shopName: "Xiaomi Official Store",
    imageUrl: "https://i01.appmifile.com/webfile/globalimg/products/pc/xiaomi-smart-band-8/specs01.png",
    priceVnd: 780_000,
    originalPriceVnd: 990_000,
    originalUrl: "https://www.mi.com/global/product/xiaomi-smart-band-8/",
  },
  {
    platformOrderId: "DEMO-SP-1002",
    platform: "SHOPEE",
    productId: "philips-ac1214-10",
    shopId: "philips-official",
    productName: "M\u00e1y l\u1ecdc kh\u00f4ng kh\u00ed Philips Series 1000i AC1214/10",
    shopName: "Philips Official Store",
    imageUrl: "https://images.philips.com/is/image/PhilipsConsumer/AC1214_10-IMS-en_GB?$pnglarge$&wid=320",
    priceVnd: 599_000,
    originalPriceVnd: 899_000,
    originalUrl: "https://www.philips.com.vn/c-p/AC1214_10/1000i-series-air-purifier",
  },
  {
    platformOrderId: "DEMO-TT-2002",
    platform: "TIKTOK",
    productId: "anessa-perfect-uv-milk",
    shopId: "anessa-official",
    productName: "S\u1eefa ch\u1ed1ng n\u1eafng Anessa Perfect UV Sunscreen Skincare Milk SPF50+",
    shopName: "Anessa Official Store",
    imageUrl: "https://www.anessa.shiseido.co.jp/products/suncare/perfect_uv_sm/images/img_product.png",
    priceVnd: 199_000,
    originalPriceVnd: 350_000,
    originalUrl: "https://www.anessa.shiseido.co.jp/products/suncare/perfect_uv_sm/",
  },
  {
    platformOrderId: "DEMO-LZ-3002",
    platform: "LAZADA",
    productId: "makita-cordless-grinder-body",
    shopId: "makita-tools-store",
    productName: "Th\u00e2n m\u00e1y m\u00e0i pin c\u1ea7m tay Makita Universal Battery-Powered",
    shopName: "Makita Tools Store",
    imageUrl: "https://lzd-img-global.slatic.net/g/p/0fdd72147b1418cb1c8d2365c0388665.jpg_720x720q80.jpg",
    priceVnd: 68_600,
    originalPriceVnd: 121_540,
    originalUrl: "https://www.lazada.vn/products/pdp-i2383196313-s13314698197.html",
  },
] as const;

const config = loadConfig();
const db = createDatabase(config);

async function run(): Promise<void> {
  const user = await query<{ id: string }>(
    db,
    "SELECT id FROM users WHERE lower(email) = lower($1) AND status = 'ACTIVE'",
    [TARGET_EMAIL],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error(`Không tìm thấy user ACTIVE ${TARGET_EMAIL}.`);

  for (const product of products) {
    const clickId = `seed-${product.platformOrderId.toLowerCase()}`;
    const link = await query<{ id: string }>(
      db,
      `
        INSERT INTO affiliate_links (
          user_id, platform, click_id, original_url, normalized_url,
          affiliate_url, sub_id, source, campaign, product_id, shop_id,
          product_name, shop_name, product_image_url, product_price_vnd,
          product_original_price_vnd, commission_source
        ) VALUES (
          $1, $2, $3, $4, $4, $4, $3, 'seed', 'demo-user',
          $5, $6, $7, $8, $9, $10, $11, 'UNAVAILABLE'
        )
        ON CONFLICT (click_id) DO UPDATE SET
          product_id = EXCLUDED.product_id,
          shop_id = EXCLUDED.shop_id,
          product_name = EXCLUDED.product_name,
          shop_name = EXCLUDED.shop_name,
          product_image_url = EXCLUDED.product_image_url,
          product_price_vnd = EXCLUDED.product_price_vnd,
          product_original_price_vnd = EXCLUDED.product_original_price_vnd,
          original_url = EXCLUDED.original_url,
          normalized_url = EXCLUDED.normalized_url,
          affiliate_url = EXCLUDED.affiliate_url
        RETURNING id
      `,
      [
        userId,
        product.platform,
        clickId,
        product.originalUrl,
        product.productId,
        product.shopId,
        product.productName,
        product.shopName,
        product.imageUrl,
        product.priceVnd,
        product.originalPriceVnd,
      ],
    );
    await query(
      db,
      `
        UPDATE orders
        SET affiliate_link_id = $1
        WHERE user_id = $2
          AND platform = $3
          AND platform_order_id = $4
      `,
      [link.rows[0]!.id, userId, product.platform, product.platformOrderId],
    );
    await query(
      db,
      `
        UPDATE orders
        SET affiliate_link_id = $1
        WHERE user_id = $2
          AND platform_order_id = $3
          AND affiliate_link_id IS NULL
      `,
      [link.rows[0]!.id, userId, product.platformOrderId],
    );
  }

  const result = await query<{ linked_orders: string }>(
    db,
    `
      SELECT count(*)::text AS linked_orders
      FROM orders o
      JOIN affiliate_links l ON l.id = o.affiliate_link_id
      WHERE o.user_id = $1 AND o.platform_order_id LIKE 'DEMO-%'
    `,
    [userId],
  );
  console.info(`Đã gắn sản phẩm thật cho ${result.rows[0]?.linked_orders ?? "0"} đơn demo.`);
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
