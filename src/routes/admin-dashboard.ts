import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import type { AdminConsoleDeps } from "./admin-console-shared.js";

export async function registerAdminDashboardRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/console", async (_request, reply) => {
    const [today, queue, booked, recentActivity] = await Promise.all([
      // So sánh hôm nay với hôm qua — chỉ 3 số có mốc thời gian tự nhiên để
      // so sánh thật, không suy diễn phần trăm cho các số còn lại.
      query<{
        buyers_today: string;
        buyers_yesterday: string;
        gmv_today: string;
        gmv_yesterday: string;
        platform_today: string;
        platform_yesterday: string;
      }>(
        deps.db,
        `
          SELECT
            (SELECT count(DISTINCT user_id) FROM orders
              WHERE (COALESCE(purchased_at, created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
                (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED'))::text AS buyers_today,
            (SELECT count(DISTINCT user_id) FROM orders
              WHERE (COALESCE(purchased_at, created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
                (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1
                AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED'))::text AS buyers_yesterday,
            COALESCE((SELECT sum(order_amount_vnd) FROM orders
              WHERE (COALESCE(purchased_at, created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
                (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')), 0)::text AS gmv_today,
            COALESCE((SELECT sum(order_amount_vnd) FROM orders
              WHERE (COALESCE(purchased_at, created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
                (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1
                AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')), 0)::text AS gmv_yesterday,
            COALESCE((SELECT sum(ce.platform_amount_vnd)
              FROM commission_entries ce JOIN orders o ON o.id = ce.order_id
              WHERE o.status = 'APPROVED' AND ce.status = 'AVAILABLE'
                AND (o.approved_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
                  (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 0)::text AS platform_today,
            COALESCE((SELECT sum(ce.platform_amount_vnd)
              FROM commission_entries ce JOIN orders o ON o.id = ce.order_id
              WHERE o.status = 'APPROVED' AND ce.status = 'AVAILABLE'
                AND (o.approved_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date =
                  (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1), 0)::text AS platform_yesterday
        `,
      ),
      // Khu cần xử lý — mỗi dòng là một hàng đợi thật, có trang xử lý riêng.
      query<{
        orders_pending: string;
        banks_pending: string;
        withdrawals_pending: string;
        raw_errors: string;
      }>(
        deps.db,
        `
          SELECT
            (SELECT count(*) FROM orders WHERE status = 'PENDING')::text AS orders_pending,
            (SELECT count(*) FROM user_bank_accounts
              WHERE status = 'PENDING_REVIEW')::text AS banks_pending,
            (SELECT count(*) FROM withdrawals
              WHERE status IN ('FUNDS_HELD', 'APPROVED', 'PROCESSING', 'UNKNOWN'))::text
              AS withdrawals_pending,
            (SELECT count(*) FROM conversion_raw
              WHERE processing_error IS NOT NULL)::text AS raw_errors
        `,
      ),
      // "Đã ghi sổ" (khả dụng, từ trước đến nay), "Đang chờ" (hoa hồng đơn
      // chưa duyệt) và "Dự kiến" (đang giữ/chờ chuyển cho người rút tiền) —
      // ba phạm vi dữ liệu khác nhau của cùng nguồn commission_entries/orders,
      // KHÔNG dùng số dư ledger SYSTEM/PLATFORM_REVENUE vì số đó lệch với
      // commission_entries trên môi trường này (xem ghi chú trong báo cáo).
      query<{
        platform_booked_vnd: string;
        orders_approved: string;
        pending_commission_vnd: string;
        orders_pending: string;
        projected_payout_vnd: string;
        withdrawals_projected: string;
      }>(
        deps.db,
        `
          SELECT
            COALESCE((SELECT sum(ce.platform_amount_vnd)
              FROM commission_entries ce JOIN orders o ON o.id = ce.order_id
              WHERE o.status = 'APPROVED' AND ce.status = 'AVAILABLE'), 0)::text
              AS platform_booked_vnd,
            (SELECT count(*) FROM orders WHERE status = 'APPROVED')::text AS orders_approved,
            COALESCE((SELECT sum(commission_vnd) FROM orders
              WHERE status = 'PENDING'), 0)::text AS pending_commission_vnd,
            (SELECT count(*) FROM orders WHERE status = 'PENDING')::text AS orders_pending,
            COALESCE((SELECT sum(amount_vnd) FROM withdrawals
              WHERE status IN ('FUNDS_HELD', 'APPROVED', 'PROCESSING', 'UNKNOWN')), 0)::text
              AS projected_payout_vnd,
            (SELECT count(*) FROM withdrawals
              WHERE status IN ('FUNDS_HELD', 'APPROVED', 'PROCESSING', 'UNKNOWN'))::text
              AS withdrawals_projected
        `,
      ),
      // Hoạt động gần đây — cùng nguồn với /backoffice/audit, rút gọn 8 dòng.
      query<{
        id: string;
        actor_name: string | null;
        actor_email: string | null;
        action: string;
        target_type: string;
        target_id: string | null;
        reason: string | null;
        created_at: Date;
      }>(
        deps.db,
        `
          SELECT a.id, u.full_name AS actor_name, u.email AS actor_email,
            a.action, a.target_type, a.target_id, a.reason, a.created_at
          FROM audit_logs a
          LEFT JOIN users u ON u.id = a.actor_user_id
          ORDER BY a.created_at DESC LIMIT 8
        `,
      ),
    ]);

    return reply.view("backoffice/ops-dashboard-v2.njk", {
      pageTitle: "Bàn điều hành",
      backofficeSection: "dashboard",
      generatedAt: new Date(),
      today: today.rows[0],
      queue: queue.rows[0],
      booked: booked.rows[0],
      recentActivity: recentActivity.rows,
    });
  });
}
