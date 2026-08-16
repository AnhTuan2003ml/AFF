import { query, type Database } from "../db.js";

export interface ViewedProduct {
  productId: string | null;
  productName: string;
  productUrl: string | null;
  productImageUrl: string | null;
  productPriceVnd: number | null;
  platform: string;
  subId: string;
  campaign: string | null;
  archivedAt: Date;
}

interface ViewedProductRow {
  product_id: string | null;
  product_name: string | null;
  product_url: string | null;
  product_image_url: string | null;
  product_price_vnd: string | null;
  platform: string;
  sub_id: string;
  campaign: string | null;
  archived_at: Date;
}

/**
 * Danh sách "sản phẩm đã xem" của một user — các lượt bấm "Mua ngay" đã được
 * dọn khỏi lịch sử chờ (không thành đơn) nhưng vẫn giữ lại để xem lại. Gộp
 * theo sản phẩm, lấy lần gần nhất trước (mỗi sản phẩm một dòng), mới nhất lên
 * đầu. Sản phẩm không có mã (product_id NULL) giữ nguyên theo Sub ID.
 */
export async function listViewedProducts(
  db: Database,
  userId: string,
  limit = 60,
): Promise<ViewedProduct[]> {
  const result = await query<ViewedProductRow>(
    db,
    `
      SELECT DISTINCT ON (COALESCE(product_id, sub_id))
        product_id, product_name, product_url, product_image_url,
        product_price_vnd::text, platform, sub_id, campaign, archived_at
      FROM viewed_products
      WHERE user_id = $1
      ORDER BY COALESCE(product_id, sub_id), archived_at DESC
      LIMIT $2
    `,
    [userId, limit],
  );
  // DISTINCT ON sắp theo khóa gộp; sắp lại theo thời gian cho hiển thị.
  return result.rows
    .map((row) => ({
      productId: row.product_id,
      productName: row.product_name ?? "Sản phẩm",
      productUrl: row.product_url,
      productImageUrl: row.product_image_url,
      productPriceVnd:
        row.product_price_vnd === null ? null : Number(row.product_price_vnd),
      platform: row.platform,
      subId: row.sub_id,
      campaign: row.campaign,
      archivedAt: row.archived_at,
    }))
    .sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());
}
