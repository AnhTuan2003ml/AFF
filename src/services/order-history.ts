import { query, type Database } from "../db.js";

/**
 * Lịch sử đơn hoàn tiền hiển thị cho người dùng, gộp hai nguồn:
 *
 * - `ORDER`  — đơn thật đã đối chiếu từ báo cáo sàn (bảng `orders`).
 * - `INTENT` — lượt bấm "Mua ngay" (bảng `affiliate_links`, campaign
 *   `instantbuy`) chưa có đơn nào khớp. Ghi vào lịch sử ngay khi người dùng
 *   bấm mua để họ thấy giao dịch, và tự biến mất khi lượt đồng bộ gán được
 *   đơn thật cho link đó.
 *
 * Trạng thái riêng của INTENT:
 * - `AWAITING`  — còn trong hạn ghi nhận (`affiliate_attribution_days`).
 * - `UNTRACKED` — quá hạn mà sàn vẫn không trả đơn nào.
 */
export type OrderHistoryKind = "ORDER" | "INTENT";

export interface OrderHistoryRow {
  id: string;
  record_kind: OrderHistoryKind;
  platform: string;
  platform_order_id: string | null;
  /** Mã đối chiếu của hệ thống (mã lượt click, nằm trong Sub ID gửi sàn). */
  reference_code: string | null;
  status: string;
  order_amount_vnd: string;
  commission_vnd: string;
  cashback_vnd: string;
  purchased_at: Date | null;
  created_at: Date;
  product_name: string | null;
  product_image_url: string | null;
  product_price_vnd: string | null;
  product_original_price_vnd: string | null;
  cashback_rate_percent: string | null;
  estimated_payout_at: Date | null;
  cancel_reason: string | null;
  completed_at: Date | null;
  cashback_released_at: Date | null;
  hold_days_left: string | null;
}

export interface OrderHistoryParams {
  userId: string;
  /** Trạng thái đơn cần lọc, hoặc 'ALL'. */
  status: string;
  /** 'ALL' | 'RELEASED' (đã về ví) | 'HELD' (chưa về ví). */
  released: "ALL" | "RELEASED" | "HELD";
  searchTerm: string;
  attributionDays: number;
  limit?: number;
}

const HISTORY_SQL = `
  SELECT * FROM (
    SELECT o.id, 'ORDER' AS record_kind, o.platform, o.platform_order_id,
      l.click_id AS reference_code,
      o.status, o.order_amount_vnd::text, o.commission_vnd::text,
      o.cashback_vnd::text, o.purchased_at, o.created_at,
      COALESCE(oi.item_name, l.product_name) AS product_name,
      COALESCE(oi.item_image_url, l.product_image_url) AS product_image_url,
      COALESCE(oi.amount_vnd, l.product_price_vnd)::text AS product_price_vnd,
      CASE
        WHEN oi.source = 'REPORT' THEN NULL
        WHEN l.product_original_price_vnd > l.product_price_vnd
        THEN l.product_original_price_vnd::text
        ELSE NULL
      END AS product_original_price_vnd,
      CASE
        WHEN o.order_amount_vnd > 0
        THEN trim(to_char(
          (o.cashback_vnd::numeric / o.order_amount_vnd::numeric) * 100,
          'FM999990.0'
        ))
        ELSE NULL
      END AS cashback_rate_percent,
      COALESCE(
        o.cashback_available_at,
        o.completed_at + interval '7 days',
        o.purchased_at + interval '7 days',
        o.created_at + interval '7 days'
      ) AS estimated_payout_at,
      o.cancel_reason, o.completed_at, o.cashback_released_at,
      CASE
        WHEN o.cashback_released_at IS NOT NULL THEN NULL
        WHEN o.cashback_available_at IS NULL THEN NULL
        ELSE GREATEST(
          0,
          ceil(extract(epoch FROM o.cashback_available_at - now()) / 86400)
        )::text
      END AS hold_days_left,
      COALESCE(o.purchased_at, o.created_at) AS sort_at
    FROM orders o
    LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
    LEFT JOIN LATERAL (
      SELECT item_name, item_image_url, amount_vnd, source
      FROM order_items
      WHERE order_id = o.id
      ORDER BY CASE source WHEN 'REPORT' THEN 0 ELSE 1 END, id
      LIMIT 1
    ) oi ON true
    WHERE o.user_id = $1
      AND ($2 = 'ALL' OR o.status = $2)
      AND (
        $4 = 'ALL'
        OR ($4 = 'RELEASED' AND o.cashback_released_at IS NOT NULL)
        OR ($4 = 'HELD' AND o.cashback_released_at IS NULL)
      )
      AND (
        $3 = ''
        OR o.platform_order_id ILIKE '%' || $3 || '%'
        OR COALESCE(oi.item_name, l.product_name, '') ILIKE '%' || $3 || '%'
      )

    UNION ALL

    SELECT il.id, 'INTENT' AS record_kind, il.platform,
      NULL::text AS platform_order_id,
      il.click_id AS reference_code,
      CASE
        WHEN il.created_at > now() - ($5::text || ' days')::interval
        THEN 'AWAITING'
        ELSE 'UNTRACKED'
      END AS status,
      COALESCE(il.product_price_vnd, 0)::text AS order_amount_vnd,
      COALESCE(il.estimated_commission_vnd, 0)::text AS commission_vnd,
      COALESCE(il.estimated_cashback_vnd, 0)::text AS cashback_vnd,
      il.created_at AS purchased_at, il.created_at,
      il.product_name, il.product_image_url,
      il.product_price_vnd::text AS product_price_vnd,
      CASE
        WHEN il.product_original_price_vnd > il.product_price_vnd
        THEN il.product_original_price_vnd::text
        ELSE NULL
      END AS product_original_price_vnd,
      CASE
        WHEN il.product_price_vnd > 0 AND il.estimated_cashback_vnd > 0
        THEN trim(to_char(
          (il.estimated_cashback_vnd::numeric / il.product_price_vnd::numeric) * 100,
          'FM999990.0'
        ))
        ELSE NULL
      END AS cashback_rate_percent,
      NULL::timestamptz AS estimated_payout_at,
      NULL::text AS cancel_reason,
      NULL::timestamptz AS completed_at,
      NULL::timestamptz AS cashback_released_at,
      NULL::text AS hold_days_left,
      il.created_at AS sort_at
    FROM affiliate_links il
    WHERE il.user_id = $1
      AND il.campaign = 'instantbuy'
      -- Lượt mua chưa có đơn chỉ nằm ở nhóm "đang chờ".
      AND $2 IN ('ALL', 'PENDING')
      AND $4 <> 'RELEASED'
      AND NOT EXISTS (
        SELECT 1 FROM orders mo WHERE mo.affiliate_link_id = il.id
      )
      AND ($3 = '' OR COALESCE(il.product_name, '') ILIKE '%' || $3 || '%')
  ) history
  ORDER BY sort_at DESC
  LIMIT $6
`;

export async function listOrderHistory(
  db: Database,
  params: OrderHistoryParams,
): Promise<OrderHistoryRow[]> {
  const result = await query<OrderHistoryRow>(db, HISTORY_SQL, [
    params.userId,
    params.status,
    params.searchTerm,
    params.released,
    params.attributionDays,
    Math.min(Math.max(params.limit ?? 100, 1), 200),
  ]);
  return result.rows;
}
