import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import { query } from "../../db.js";
import { parseInput } from "../../lib/validation.js";
import { getBusinessConfig } from "../../services/business-config.js";
import { getWalletBalances } from "../../services/ledger.js";
import { sendSupportChatMessage } from "../../services/support-chat.js";
import type { ApiDeps } from "./deps.js";

export async function registerAccountApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  app.get("/me", { preHandler: requireApiUser }, async (request) => {
    const userId = request.currentUser!.id;
    const [balances, businessConfig, daMua] = await Promise.all([
      getWalletBalances(deps.db, userId),
      getBusinessConfig(deps.db, deps.config),
      query<{ n: string }>(
        deps.db,
        `SELECT count(*)::text AS n FROM orders
          WHERE user_id = $1 AND status IN ('APPROVED', 'PAID')`,
        [userId],
      ),
    ]);
    return {
      user: request.currentUser,
      balances,
      // Hai số này trang chủ web hiện ngay trên hero và thẻ ví; app cần chúng
      // để dựng lại đúng, nếu không phải gọi thêm một vòng API nữa.
      cashbackPercent: businessConfig.buyerCashbackPercent,
      purchasedProducts: Number(daMua.rows[0]?.n ?? 0),
      minWithdrawalVnd: deps.config.MIN_WITHDRAWAL_VND,
    };
  });

  app.get("/me/orders", { preHandler: requireApiUser }, async (request) => {
    const orders = await query(
      deps.db,
      `
        SELECT o.id, o.platform, o.platform_order_id, o.status,
          o.order_amount_vnd, o.commission_vnd, o.cashback_vnd,
          o.purchased_at, o.approved_at, o.created_at, o.completed_at,
          o.cancel_reason, o.cashback_available_at, o.cashback_released_at,
          COALESCE(oi.item_name, l.product_name) AS product_name,
          COALESCE(oi.item_image_url, l.product_image_url) AS product_image_url,
          COALESCE(oi.amount_vnd, l.product_price_vnd) AS product_price_vnd,
          CASE
            WHEN oi.source = 'REPORT' THEN NULL
            WHEN l.product_original_price_vnd > l.product_price_vnd
            THEN l.product_original_price_vnd
            ELSE NULL
          END AS product_original_price_vnd
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
        ORDER BY COALESCE(o.purchased_at, o.created_at) DESC
        LIMIT 100
      `,
      [request.currentUser!.id],
    );
    return { data: orders.rows };
  });

  app.get("/me/wallet", { preHandler: requireApiUser }, async (request) => {
    const balances = await getWalletBalances(deps.db, request.currentUser!.id);
    const history = await query(
      deps.db,
      `
        SELECT t.id, t.type, t.description, a.code, e.direction,
          e.amount_vnd, t.created_at
        FROM ledger_entries e
        JOIN ledger_transactions t ON t.id = e.transaction_id
        JOIN ledger_accounts a ON a.id = e.account_id
        WHERE a.owner_type = 'USER' AND a.owner_id = $1
        ORDER BY t.created_at DESC LIMIT 100
      `,
      [request.currentUser!.id],
    );
    return { balances, history: history.rows };
  });

  app.get(
    "/me/withdrawals",
    { preHandler: requireApiUser },
    async (request) => {
      const withdrawals = await query(
        deps.db,
        `
          SELECT id, amount_vnd, bank_code, bank_last4, status,
            rejection_reason, requested_at, paid_at
          FROM withdrawals
          WHERE user_id = $1
          ORDER BY requested_at DESC LIMIT 100
        `,
        [request.currentUser!.id],
      );
      return { data: withdrawals.rows };
    },
  );

  // "Chưa ghi nhận đơn" đi chung đường ống chat hỗ trợ: lưu hội thoại của
  // người dùng và đổ vào thread Slack — không còn hệ ticket riêng.
  app.post(
    "/support/missing-order",
    { preHandler: requireApiUser },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          orderId: z.string().trim().min(3).max(100),
          description: z.string().trim().min(20).max(3000),
        }),
        request.body,
      );
      const message = await sendSupportChatMessage(deps.db, deps.config, {
        userId: request.currentUser!.id,
        userEmail: request.currentUser!.email,
        userFullName: request.currentUser!.fullName,
        body: `[Chưa ghi nhận đơn #${input.orderId}] ${input.description}`,
        logger: request.log,
      });
      return reply.code(201).send({ id: message.id, status: "RECEIVED" });
    },
  );
}
