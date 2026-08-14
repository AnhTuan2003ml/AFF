import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { AppError } from "../lib/errors.js";
import { parseInput } from "../lib/validation.js";
import type { AdminConsoleDeps } from "./admin-console-shared.js";

/**
 * Theo dõi lịch sử mua theo từng tài khoản (master-detail):
 * - Trái: tìm và chọn một tài khoản.
 * - Phải: lịch sử ĐƠN MUA (đơn thật đã đối soát) + lịch sử CLICK ĐƠN (mỗi
 *   lượt bấm "Mua ngay" tạo một link Affiliate) của tài khoản đó.
 */
export async function registerAdminPurchaseHistoryRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/purchase-history", async (_request, reply) => {
    const accounts = await query<{
      id: string;
      full_name: string;
      email: string;
      tracking_code: string | null;
      orders_count: string;
      clicks_count: string;
    }>(
      deps.db,
      `
        SELECT u.id, u.full_name, u.email, u.tracking_code,
          (SELECT count(*) FROM orders o WHERE o.user_id = u.id)::text
            AS orders_count,
          (SELECT count(*) FROM affiliate_links l WHERE l.user_id = u.id)::text
            AS clicks_count
        FROM users u
        WHERE u.status <> 'DELETED'
        ORDER BY u.created_at DESC
        LIMIT 500
      `,
    );
    return reply.view("backoffice/purchase-history.njk", {
      pageTitle: "Lịch sử mua theo tài khoản",
      backofficeSection: "purchase-history",
      accounts: accounts.rows,
    });
  });

  // JSON: lịch sử đơn mua + click của một tài khoản (nạp vào cột phải khi chọn).
  app.get<{ Params: { id: string } }>(
    "/purchase-history/:id/data",
    async (request, reply) => {
      const params = parseInput(
        z.object({ id: z.string().uuid("Tài khoản không hợp lệ.") }),
        request.params,
      );
      const userRow = await query<{
        id: string;
        full_name: string;
        email: string;
        tracking_code: string | null;
        created_at: Date;
      }>(
        deps.db,
        `SELECT id, full_name, email, tracking_code, created_at
         FROM users WHERE id = $1`,
        [params.id],
      );
      const user = userRow.rows[0];
      if (!user) {
        throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
      }

      const [orders, clicks] = await Promise.all([
        query(
          deps.db,
          `
            SELECT o.platform, o.platform_order_id, o.status,
              o.order_amount_vnd::text, o.cashback_vnd::text,
              o.purchased_at, o.created_at, l.click_id AS reference_code,
              COALESCE(oi.item_name, l.product_name) AS product_name
            FROM orders o
            LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
            LEFT JOIN LATERAL (
              SELECT item_name FROM order_items
              WHERE order_id = o.id
              ORDER BY CASE source WHEN 'REPORT' THEN 0 ELSE 1 END, id
              LIMIT 1
            ) oi ON true
            WHERE o.user_id = $1
            ORDER BY COALESCE(o.purchased_at, o.created_at) DESC
            LIMIT 100
          `,
          [params.id],
        ),
        query(
          deps.db,
          `
            SELECT l.click_id AS reference_code, l.platform, l.product_name,
              l.campaign, l.source, l.click_count::text,
              l.product_price_vnd::text, l.estimated_cashback_vnd::text,
              l.created_at,
              EXISTS (
                SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id
              ) AS has_order
            FROM affiliate_links l
            WHERE l.user_id = $1
            ORDER BY l.created_at DESC
            LIMIT 100
          `,
          [params.id],
        ),
      ]);

      reply.header("cache-control", "private, no-store");
      return reply.send({
        user,
        orders: orders.rows,
        clicks: clicks.rows,
      });
    },
  );
}
