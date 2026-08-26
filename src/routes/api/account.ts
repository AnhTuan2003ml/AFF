import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import { query } from "../../db.js";
import { parseInput } from "../../lib/validation.js";
import { getBusinessConfig } from "../../services/business-config.js";
import { getWalletBalances } from "../../services/ledger.js";
import { listOrderHistory } from "../../services/order-history.js";
import {
  listSupportChatMessages,
  sendSupportChatMessage,
  getLatestSupportExchange,
  markSupportRead,
} from "../../services/support-chat.js";
import { isSlackSupportEnabled } from "../../services/slack.js";
import {
  SUPPORT_TOPICS,
  listSupportOrderOptions,
  submitSupportRequest,
} from "../../services/support-request.js";
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
      // "Hoàn tới X%" trên app: mức tối đa (đơn nhỏ 80%) — chỉ hiển thị.
      cashbackPercent: Math.max(
        businessConfig.buyerCashbackPercent,
        businessConfig.smallOrderBuyerPercent,
      ),
      purchasedProducts: Number(daMua.rows[0]?.n ?? 0),
      minWithdrawalVnd: deps.config.MIN_WITHDRAWAL_VND,
    };
  });

  app.get("/me/orders", { preHandler: requireApiUser }, async (request) => {
    // Dùng CHUNG listOrderHistory với web: gộp đơn thật + lượt bấm Mua ngay
    // (instantbuy) CHƯA có đơn khớp — hiện ngay dưới dạng "Chờ sàn xác nhận".
    // Trước đây app chỉ query bảng orders nên lượt click-mua chưa thành đơn
    // không hiện → tưởng hệ thống "chưa ghi lại".
    const businessConfig = await getBusinessConfig(deps.db, deps.config);
    const rows = await listOrderHistory(deps.db, {
      userId: request.currentUser!.id,
      status: "ALL",
      released: "ALL",
      searchTerm: "",
      attributionDays: businessConfig.affiliateAttributionDays,
      limit: 100,
    });
    const num = (s: string | null): number | null =>
      s == null ? null : Number(s) || null;
    const data = rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      platform_order_id: r.platform_order_id,
      status: r.status,
      order_amount_vnd: num(r.order_amount_vnd),
      commission_vnd: num(r.commission_vnd),
      cashback_vnd: num(r.cashback_vnd),
      purchased_at: r.purchased_at,
      approved_at: null,
      created_at: r.created_at,
      completed_at: r.completed_at,
      cancel_reason: r.cancel_reason,
      cashback_available_at: r.estimated_payout_at,
      cashback_released_at: r.cashback_released_at,
      product_name: r.product_name,
      product_image_url: r.product_image_url,
      product_price_vnd: num(r.product_price_vnd),
      product_original_price_vnd: num(r.product_original_price_vnd),
    }));
    return { data };
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

  // Chat hỗ trợ cho app: đọc và gửi tin, đồng bộ đúng thread Slack/DB như web.
  app.get("/support", { preHandler: requireApiUser }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const data = await listSupportChatMessages(deps.db, request.currentUser!.id);
    return { data };
  });

  app.post("/support", { preHandler: requireApiUser }, async (request, reply) => {
    const input = parseInput(
      z.object({ body: z.string().trim().min(1).max(2000) }),
      request.body,
    );
    const message = await sendSupportChatMessage(deps.db, deps.config, {
      userId: request.currentUser!.id,
      userEmail: request.currentUser!.email,
      userFullName: request.currentUser!.fullName,
      body: input.body,
      logger: request.log,
    });
    return reply.code(201).send(message);
  });

  // Form hỗ trợ theo mẫu cho app — giống hệt trang /app/support của web:
  // dữ liệu để dựng form (loại vấn đề, đơn để chọn, email nhận phản hồi) và
  // yêu cầu + phản hồi mới nhất để hiện ô "Phản hồi".
  app.get("/support/form", { preHandler: requireApiUser }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const uid = request.currentUser!.id;
    const [orderOptions, conversationRow, latest] = await Promise.all([
      listSupportOrderOptions(deps.db, deps.config, uid),
      query<{ notify_email: string }>(
        deps.db,
        `SELECT notify_email FROM support_conversations WHERE user_id = $1`,
        [uid],
      ),
      getLatestSupportExchange(deps.db, uid),
    ]);
    // Mở form = đã xem mọi phản hồi CSKH tới lúc này (như web).
    await markSupportRead(deps.db, uid);
    return {
      topics: SUPPORT_TOPICS,
      orderOptions,
      notifyEmail: conversationRow.rows[0]?.notify_email || request.currentUser!.email,
      latestRequest: latest.request,
      latestReply: latest.reply,
      chatOnline: isSlackSupportEnabled(deps.config),
    };
  });

  // Gửi yêu cầu theo mẫu — cùng validate + cùng thread Slack/DB với web
  // (POST /app/support/requests).
  app.post("/support/requests", { preHandler: requireApiUser }, async (request, reply) => {
    const input = parseInput(
      z.object({
        topic: z.string().trim().min(1).max(50),
        orderKey: z.string().trim().max(120).optional(),
        orderCode: z.string().trim().max(100).optional(),
        description: z.string().trim().min(1).max(3000),
        notifyEmail: z.string().trim().max(254).optional(),
      }),
      request.body,
    );
    const message = await submitSupportRequest(deps.db, deps.config, {
      userId: request.currentUser!.id,
      userEmail: request.currentUser!.email,
      userFullName: request.currentUser!.fullName,
      topic: input.topic,
      ...(input.orderKey ? { orderKey: input.orderKey } : {}),
      ...(input.orderCode ? { orderCode: input.orderCode } : {}),
      description: input.description,
      ...(input.notifyEmail !== undefined ? { notifyEmail: input.notifyEmail } : {}),
      logger: request.log,
    });
    return reply.code(201).send({ message });
  });

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
