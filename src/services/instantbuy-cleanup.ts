import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";

/**
 * Dọn lượt bấm "Mua ngay" không thành đơn.
 *
 * Mỗi lần bấm mua tạo một `affiliate_links` campaign `instantbuy` (hiện trong
 * lịch sử dạng "Chờ sàn xác nhận"). Đối soát định kỳ (runShopeeOrderSync) gán
 * đơn thật cho link khi báo cáo Shopee có đơn khớp Sub ID. Nếu quá
 * `INSTANTBUY_KEEP_DAYS` ngày mà vẫn KHÔNG có đơn nào khớp thì coi như người
 * dùng chỉ bấm thử / không mua — xóa link để nó biến mất khỏi lịch sử.
 *
 * Chỉ xóa link CHƯA có đơn (NOT EXISTS orders) nên không bao giờ chạm vào đơn
 * đã đối soát. click_events tham chiếu link sẽ tự xóa theo (ON DELETE CASCADE).
 */
export async function pruneUnconfirmedInstantBuys(
  db: Database,
  config: AppConfig,
): Promise<number> {
  const result = await query(
    db,
    `
      DELETE FROM affiliate_links l
      WHERE l.campaign = 'instantbuy'
        AND l.created_at < now() - ($1::text || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id
        )
    `,
    [config.INSTANTBUY_KEEP_DAYS],
  );
  return result.rowCount ?? 0;
}
