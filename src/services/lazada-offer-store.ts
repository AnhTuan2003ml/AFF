import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import {
  fetchLazadaOfferPage,
  isLazadaAffiliateConfigured,
  type LazadaOfferProduct,
} from "./lazada-affiliate-api.js";

/**
 * Kho sản phẩm affiliate LAZADA (bảng lazada_offer_products). Làm mới 1
 * lần/ngày (song song với Shopee) rồi lưu vào DB; trang Khám phá đọc từ đây
 * nên không phải gọi API Lazada mỗi lượt xem.
 */

type Fetcher = typeof fetch;

/** Số trang feed lấy mỗi lượt làm mới (20 sp/trang). */
const REFRESH_PAGES = 5;

export interface StoredLazadaOffer {
  item_id: string;
  name: string;
  image_url: string | null;
  price_vnd: string | null;
  commission_rate_bps: number | null;
  commission_vnd: string | null;
  shop_name: string | null;
  product_url: string;
  sales_count: number | null;
}

/**
 * Làm mới kho: lấy REFRESH_PAGES trang feed SONG SONG, gộp + khử trùng theo
 * itemId, upsert kèm position (thứ tự feed) rồi xóa sản phẩm cũ không còn.
 * Lấy về rỗng (API lỗi) thì GIỮ nguyên dữ liệu cũ, không xóa.
 */
export async function refreshLazadaOffers(
  db: Database,
  config: AppConfig,
  fetcher: Fetcher = fetch,
): Promise<{ saved: number }> {
  if (!isLazadaAffiliateConfigured(config)) return { saved: 0 };

  const pages = await Promise.all(
    Array.from({ length: REFRESH_PAGES }, (_, index) =>
      fetchLazadaOfferPage(config, { page: index + 1, limit: 20 }, fetcher),
    ),
  );

  const seen = new Set<string>();
  const batch: LazadaOfferProduct[] = [];
  for (const product of pages.flat()) {
    if (seen.has(product.itemId)) continue;
    seen.add(product.itemId);
    batch.push(product);
  }
  if (!batch.length) return { saved: 0 };

  for (const [position, product] of batch.entries()) {
    await query(
      db,
      `
        INSERT INTO lazada_offer_products (
          item_id, name, image_url, price_vnd, commission_rate_bps,
          commission_vnd, shop_name, product_url, sales_count, position,
          fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
        ON CONFLICT (item_id) DO UPDATE SET
          name = EXCLUDED.name,
          image_url = EXCLUDED.image_url,
          price_vnd = EXCLUDED.price_vnd,
          commission_rate_bps = EXCLUDED.commission_rate_bps,
          commission_vnd = EXCLUDED.commission_vnd,
          shop_name = EXCLUDED.shop_name,
          product_url = EXCLUDED.product_url,
          sales_count = EXCLUDED.sales_count,
          position = EXCLUDED.position,
          fetched_at = now()
      `,
      [
        product.itemId,
        product.name.slice(0, 300),
        product.imageUrl,
        product.priceVnd,
        product.commissionRateBps,
        product.commissionVnd,
        product.shopName,
        product.productUrl,
        product.salesCount,
        position,
      ],
    );
  }

  // Xóa sản phẩm không còn trong đợt mới nhất.
  await query(
    db,
    `DELETE FROM lazada_offer_products WHERE NOT (item_id = ANY($1::text[]))`,
    [batch.map((product) => product.itemId)],
  );

  return { saved: batch.length };
}

/** Mốc làm mới gần nhất — để scheduler biết đã chạy trong ngày chưa. */
export async function getLazadaOffersLastFetchedAt(
  db: Database,
): Promise<Date | null> {
  const result = await query<{ t: Date | null }>(
    db,
    `SELECT max(fetched_at) AS t FROM lazada_offer_products`,
  );
  return result.rows[0]?.t ?? null;
}

/**
 * Đọc một trang từ kho theo mục: hot = hoa hồng cao, best = bán chạy,
 * recommend/khác = thứ tự feed.
 */
export async function getStoredLazadaOffers(
  db: Database,
  opts: { list: string; page: number; pageSize: number },
): Promise<StoredLazadaOffer[]> {
  const orderBy =
    opts.list === "hot"
      ? "commission_vnd DESC NULLS LAST, position"
      : opts.list === "best"
        ? "sales_count DESC NULLS LAST, position"
        : "position";
  const offset = Math.max(0, (opts.page - 1) * opts.pageSize);
  const result = await query<StoredLazadaOffer>(
    db,
    `
      SELECT item_id, name, image_url, price_vnd::text, commission_rate_bps,
        commission_vnd::text, shop_name, product_url, sales_count
      FROM lazada_offer_products
      ORDER BY ${orderBy}
      OFFSET $1 LIMIT $2
    `,
    [offset, opts.pageSize],
  );
  return result.rows;
}

/** Tổng số sản phẩm trong kho — để vẽ phân trang. */
export async function getStoredLazadaOffersCount(
  db: Database,
): Promise<number> {
  const result = await query<{ count: string }>(
    db,
    `SELECT count(*)::text AS count FROM lazada_offer_products`,
  );
  return Number(result.rows[0]?.count ?? 0);
}
