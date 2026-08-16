import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";

/**
 * Dọn lượt bấm "Mua ngay" không thành đơn.
 *
 * Mỗi lần bấm mua tạo một `affiliate_links` campaign `instantbuy` (hiện trong
 * lịch sử dạng "Chờ sàn xác nhận"). Đối soát định kỳ (runShopeeOrderSync) gán
 * đơn thật cho link khi báo cáo Shopee có đơn khớp Sub ID. Nếu quá
 * `INSTANTBUY_KEEP_DAYS` ngày mà vẫn KHÔNG có đơn nào khớp thì coi như người
 * dùng chỉ bấm thử / không mua — gỡ link khỏi lịch sử "Chờ sàn xác nhận".
 *
 * KHÔNG xóa trắng nữa: trước khi gỡ, chép sản phẩm + Sub ID sang
 * `viewed_products` để mỗi user còn thấy lại sản phẩm đã xem và giữ dấu vết
 * Sub ID (phòng khi đơn về muộn còn tra cứu). Chỉ gỡ link CHƯA có đơn
 * (NOT EXISTS orders) nên không bao giờ chạm vào đơn đã đối soát;
 * click_events tham chiếu link sẽ tự xóa theo (ON DELETE CASCADE).
 */
export async function pruneUnconfirmedInstantBuys(
  db: Database,
  config: AppConfig,
): Promise<number> {
  const result = await query(
    db,
    `
      WITH doomed AS (
        SELECT l.id, l.user_id, l.platform, l.product_id, l.product_name,
          l.normalized_url, l.product_image_url, l.product_price_vnd,
          l.sub_id, l.click_id, l.campaign, l.created_at
        FROM affiliate_links l
        WHERE l.campaign = 'instantbuy'
          AND l.created_at < now() - ($1::text || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id
          )
      ),
      archived AS (
        INSERT INTO viewed_products (
          user_id, platform, product_id, product_name, product_url,
          product_image_url, product_price_vnd, sub_id, click_id, campaign,
          link_created_at
        )
        SELECT user_id, platform, product_id, product_name, normalized_url,
          product_image_url, product_price_vnd, sub_id, click_id, campaign,
          created_at
        FROM doomed
        ON CONFLICT (user_id, sub_id) DO NOTHING
      )
      DELETE FROM affiliate_links WHERE id IN (SELECT id FROM doomed)
    `,
    [config.INSTANTBUY_KEEP_DAYS],
  );
  return result.rowCount ?? 0;
}
