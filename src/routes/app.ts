import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth/guards.js";
import { revokeCurrentSession, revokeAllUserSessions } from "../auth/session.js";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { decryptField, sha256 } from "../lib/crypto.js";
import { AppError, asAppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { parseInput } from "../lib/validation.js";
import {
  confirmBankChange,
  requestBankChange,
  BANKS,
} from "../services/bank.js";
import { getBusinessConfig } from "../services/business-config.js";
import { listOrderHistory } from "../services/order-history.js";
import { createPurchaseIntent } from "../services/affiliate.js";
import { getAppDashboard } from "../services/app-dashboard.js";
import { buildSeriesLineChart } from "../services/chart-data.js";
import { lookupProductPreview } from "../services/product-preview.js";
import type { EmailService } from "../services/email.js";
import {
  createWithdrawalFromIntent,
  getWalletBalances,
} from "../services/ledger.js";
import {
  requestWithdrawal,
  verifyWithdrawalOtp,
} from "../services/withdrawal.js";
import { writeAuditLog } from "../services/audit.js";
import {
  listSupportChatMessages,
  sendSupportChatMessage,
} from "../services/support-chat.js";
import {
  SUPPORT_TOPICS,
  platformDisplayName,
  submitSupportRequest,
} from "../services/support-request.js";
import { isSlackSupportEnabled } from "../services/slack.js";
import {
  claimMissionReward,
  getUserMissionOverview,
  markAllNotificationsRead,
} from "../services/mission.js";

interface AppRouteDeps {
  db: Database;
  config: AppConfig;
  emailService: EmailService;
}

function userId(request: { currentUser: { id: string } | null }): string {
  if (!request.currentUser) {
    throw new AppError("AUTH_REQUIRED", "Bạn cần đăng nhập.", 401);
  }
  return request.currentUser.id;
}

function flashError(
  reply: Parameters<typeof setFlash>[0],
  config: AppConfig,
  error: unknown,
): void {
  setFlash(
    reply,
    config,
    "error",
    error instanceof AppError
      ? error.message
      : "Hệ thống đang bận. Vui lòng thử lại.",
  );
}

export async function registerAppRoutes(
  app: FastifyInstance,
  deps: AppRouteDeps,
): Promise<void> {
  app.addHook("preHandler", requireUser);

  app.get("/entry-promo", async (_request, reply) => {
    const result = await query<{
      id: string;
      type: string;
      title: string;
      description: string;
      target_url: string | null;
      image_url: string | null;
      badge: string | null;
    }>(
      deps.db,
      `
        SELECT id, type, title, description, target_url, image_url, badge
        FROM content_items
        WHERE status = 'PUBLISHED'
          AND COALESCE(NULLIF(trim(image_url), ''), '') <> ''
        ORDER BY
          CASE type
            WHEN 'VOUCHER' THEN 0
            WHEN 'ANNOUNCEMENT' THEN 1
            WHEN 'TRENDING' THEN 2
            WHEN 'GUIDE' THEN 3
            WHEN 'PRODUCT' THEN 4
            ELSE 9
          END,
          sort_order ASC,
          published_at DESC
        LIMIT 1
      `,
    );

    const promo = result.rows[0] ?? null;
    const typeLabels: Record<string, string> = {
      VOUCHER: 'Voucher',
      TRENDING: 'Xu hướng',
      GUIDE: 'Hướng dẫn',
      ANNOUNCEMENT: 'Thông báo',
      PRODUCT: 'Sản phẩm nổi bật',
    };

    reply.header('cache-control', 'private, no-store');
    return reply.send({
      promo: promo
        ? {
            id: promo.id,
            type: promo.type,
            typeLabel: typeLabels[promo.type] ?? promo.type,
            title: promo.title,
            description: promo.description,
            targetUrl: promo.target_url,
            imageUrl: promo.image_url,
            badge: promo.badge,
          }
        : null,
    });
  });

  app.get("/", async (request, reply) => {
    const dashboard = await getAppDashboard(
      deps.db,
      deps.config,
      userId(request),
    );
    return reply.view("app/dashboard.njk", {
      pageTitle: "Mua hoàn tiền",
      appSection: "dashboard",
      ...dashboard,
    });
  });

  // Mỗi người dùng là một "nhân viên sale thứ cấp": tạo link chia sẻ cho
  // sản phẩm, theo dõi lượt mở, đơn phát sinh và tỉ lệ chuyển đổi.
  app.get("/links", async (request, reply) => {
    const id = userId(request);
    const [businessConfig, links, totals, shareEarnings, clicksByDay] =
      await Promise.all([
        getBusinessConfig(deps.db, deps.config),
        query<{
          id: string;
          product_name: string | null;
          click_id: string;
          click_count: string;
          status: string;
          created_at: Date;
          orders_count: string;
        }>(
          deps.db,
          `
            SELECT l.id, l.product_name, l.click_id, l.click_count::text,
              l.status, l.created_at,
              (SELECT count(*) FROM orders o
                WHERE o.affiliate_link_id = l.id
                  AND o.status NOT IN ('INVALID', 'CANCELLED', 'REVERSED'))::text
                AS orders_count
            FROM affiliate_links l
            WHERE l.user_id = $1 AND l.campaign = 'sharelink' AND l.status = 'ACTIVE'
            ORDER BY l.created_at DESC
            LIMIT 50
          `,
          [id],
        ),
        query<{ links: string; clicks: string }>(
          deps.db,
          `
            SELECT count(*)::text AS links,
              COALESCE(sum(click_count), 0)::text AS clicks
            FROM affiliate_links
            WHERE user_id = $1 AND campaign = 'sharelink'
          `,
          [id],
        ),
        query<{ orders: string; reward_vnd: string }>(
          deps.db,
          `
            SELECT count(*)::text AS orders,
              COALESCE(sum(referral_amount_vnd)
                FILTER (WHERE status = 'AVAILABLE'), 0)::text AS reward_vnd
            FROM commission_entries
            WHERE sharer_user_id = $1 AND status <> 'REVERSED'
          `,
          [id],
        ),
        query<{ day: Date; clicks: string }>(
          deps.db,
          `
            SELECT date_trunc('day', ev.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
              count(*)::text AS clicks
            FROM click_events ev
            JOIN affiliate_links l ON l.id = ev.affiliate_link_id
            WHERE l.user_id = $1 AND l.campaign = 'sharelink'
              AND ev.occurred_at > now() - interval '30 days'
            GROUP BY 1 ORDER BY 1
          `,
          [id],
        ),
      ]);

    const dayFormat = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
    });
    const clicksMap = new Map(
      clicksByDay.rows.map((row) => [
        dayFormat.format(new Date(row.day)),
        Number(row.clicks),
      ]),
    );
    const clickPoints = [];
    for (let back = 29; back >= 0; back -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - back);
      const label = dayFormat.format(date);
      clickPoints.push({ label, value: clicksMap.get(label) ?? 0 });
    }

    const totalClicks = Number(totals.rows[0]?.clicks ?? 0);
    const totalOrders = Number(shareEarnings.rows[0]?.orders ?? 0);
    const conversionPercent =
      totalClicks > 0
        ? Math.round((totalOrders / totalClicks) * 1000) / 10
        : 0;

    return reply.view("app/links.njk", {
      pageTitle: "Link chia sẻ",
      appSection: "links",
      shareEnabled: businessConfig.enableShareLink,
      sharerPercentOfPlatform: businessConfig.sharerRewardFromPlatformPercent,
      links: links.rows,
      appOrigin: deps.config.APP_ORIGIN,
      stats: {
        links: totals.rows[0]?.links ?? "0",
        clicks: totalClicks,
        orders: totalOrders,
        rewardVnd: shareEarnings.rows[0]?.reward_vnd ?? "0",
        conversionPercent,
      },
      clicksChart: buildSeriesLineChart(
        clickPoints,
        (value) => `${value} lượt mở`,
      ),
    });
  });

  app.post("/links", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({ productUrl: z.string().trim().min(10).max(2048) }),
        request.body,
      );
      const businessConfig = await getBusinessConfig(deps.db, deps.config);
      if (!businessConfig.enableShareLink) {
        throw new AppError(
          "SHARE_LINK_DISABLED",
          "Chương trình chia sẻ link đang tạm tắt.",
          403,
        );
      }
      const product = await lookupProductPreview(
        deps.config,
        input.productUrl,
        businessConfig.buyerCashbackPercent,
      );
      await createPurchaseIntent(deps.db, deps.config, {
        userId: userId(request),
        productUrl: product.normalizedUrl,
        cashbackRateBps: businessConfig.buyerCashbackPercent * 100,
        product,
        source: "share",
        campaign: "sharelink",
      });
      setFlash(
        reply,
        deps.config,
        "success",
        `Đã tạo link chia sẻ cho "${product.productName}". Sao chép và gửi cho người mua.`,
      );
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/app/links");
  });

  app.post<{ Params: { id: string } }>(
    "/links/:id/delete",
    async (request, reply) => {
      try {
        const result = await query(
          deps.db,
          `
            UPDATE affiliate_links
            SET status = 'EXPIRED'
            WHERE id = $1 AND user_id = $2 AND campaign = 'sharelink' AND status = 'ACTIVE'
          `,
          [request.params.id, userId(request)],
        );
        if (!result.rowCount) {
          throw new AppError(
            "LINK_NOT_FOUND",
            "Không tìm thấy link chia sẻ này hoặc đã được xóa trước đó.",
            404,
          );
        }
        setFlash(reply, deps.config, "success", "Đã xóa link chia sẻ.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/app/links");
    },
  );

  app.get("/orders", async (request, reply) => {
    const queryParams = request.query as Record<string, unknown>;
    const allowedStatuses = [
      "ALL",
      "PENDING",
      "APPROVED",
      "PAID",
      "INVALID",
      "CANCELLED",
      "REVERSED",
    ];
    const status = allowedStatuses.includes(String(queryParams.status))
      ? String(queryParams.status)
      : "ALL";
    const filterStatus = status === "PAID" ? "APPROVED" : status;
    // Tab "Đã về ví" chỉ gồm đơn đã hết thời gian giữ tiền và đã cộng vào
    // số dư khả dụng; tab "Đã duyệt" là đơn hoàn thành còn đang chờ.
    const releasedFilter =
      status === "PAID" ? "RELEASED" : status === "APPROVED" ? "HELD" : "ALL";
    const searchTerm = String(queryParams.q ?? "").trim().slice(0, 120);
    // Bấm "Mua ngay" tạo ngay một bản ghi affiliate_links. Trước khi báo cáo
    // sàn trả về mã đơn thật, bản ghi đó hiện trong lịch sử dưới dạng lượt mua
    // "chờ sàn xác nhận" và tự biến mất khi đồng bộ gán được đơn cho link.
    const businessConfig = await getBusinessConfig(deps.db, deps.config);
    const orders = await listOrderHistory(deps.db, {
      userId: userId(request),
      status: filterStatus,
      released: releasedFilter,
      searchTerm,
      attributionDays: businessConfig.affiliateAttributionDays,
    });
    return reply.view("app/orders.njk", {
      pageTitle: "Đơn hoàn tiền",
      appSection: "orders",
      orders,
      selectedStatus: status,
      searchTerm,
    });
  });

  app.get("/wallet", async (request, reply) => {
    const id = userId(request);
    const [balances, entries] = await Promise.all([
      getWalletBalances(deps.db, id),
      query<{
        transaction_id: string;
        type: string;
        description: string;
        code: string;
        direction: string;
        amount_vnd: string;
        created_at: Date;
      }>(
        deps.db,
        `
          SELECT t.id AS transaction_id, t.type, t.description, a.code,
            e.direction, e.amount_vnd::text, t.created_at
          FROM ledger_entries e
          JOIN ledger_transactions t ON t.id = e.transaction_id
          JOIN ledger_accounts a ON a.id = e.account_id
          WHERE a.owner_type = 'USER' AND a.owner_id = $1
          ORDER BY t.created_at DESC, e.created_at DESC
          LIMIT 100
        `,
        [id],
      ),
    ]);
    return reply.view("app/wallet.njk", {
      pageTitle: "Số dư hoàn tiền",
      appSection: "wallet",
      balances,
      entries: entries.rows,
    });
  });

  app.get("/banks", async (request, reply) => {
    const accounts = await query<{
      id: string;
      bank_code: string;
      account_last4: string;
      account_name_masked: string;
      account_name_ciphertext: string;
      status: string;
      rejection_reason: string | null;
      created_at: Date;
    }>(
      deps.db,
      `
        SELECT id, bank_code, account_last4, account_name_masked,
          account_name_ciphertext, status, rejection_reason, created_at
        FROM user_bank_accounts
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [userId(request)],
    );
    return reply.view("app/banks.njk", {
      pageTitle: "Tài khoản nhận tiền",
      appSection: "banks",
      banks: BANKS,
      // Chủ tài khoản xem tên đầy đủ của chính mình; nơi khác vẫn dùng bản che.
      accounts: accounts.rows.map((account) => {
        let accountName = account.account_name_masked;
        try {
          accountName = decryptField(
            account.account_name_ciphertext,
            deps.config,
          );
        } catch {
          // Giữ bản che nếu bản mã không giải được (đổi khóa cũ).
        }
        return { ...account, account_name_full: accountName };
      }),
    });
  });

  app.post("/banks/request", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({
          bankCode: z.string().trim().min(2).max(10),
          accountNumber: z.string().trim().regex(/^\d{6,20}$/),
          accountName: z.string().trim().min(3).max(100),
        }),
        request.body,
      );
      const id = await requestBankChange(
        deps.db,
        deps.emailService,
        deps.config,
        {
          userId: userId(request),
          email: request.currentUser!.email,
          ...input,
        },
      );
      return reply.redirect(`/app/banks/confirm/${id}`);
    } catch (error) {
      flashError(reply, deps.config, error);
      return reply.redirect("/app/banks");
    }
  });

  app.get<{ Params: { id: string } }>(
    "/banks/confirm/:id",
    async (request, reply) => {
      const pending = await query<{
        id: string;
        bank_code: string;
        account_last4: string;
        account_name_masked: string;
        expires_at: Date;
      }>(
        deps.db,
        `
          SELECT id, bank_code, account_last4, account_name_masked, expires_at
          FROM bank_change_requests
          WHERE id = $1 AND user_id = $2
            AND status = 'OTP_PENDING' AND expires_at > now()
        `,
        [request.params.id, userId(request)],
      );
      if (!pending.rows[0]) return reply.redirect("/app/banks");
      return reply.view("app/bank-confirm.njk", {
        pageTitle: "Xác nhận tài khoản ngân hàng",
        appSection: "banks",
        pending: pending.rows[0],
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/banks/confirm/:id",
    async (request, reply) => {
      try {
        const input = parseInput(
          z.object({
            code: z.string().trim().regex(/^\d{6}$/, "Mã OTP gồm 6 chữ số."),
          }),
          request.body,
        );
        const bankId = await confirmBankChange(deps.db, deps.config, {
          requestId: request.params.id,
          userId: userId(request),
          email: request.currentUser!.email,
          code: input.code,
        });
        await writeAuditLog(deps.db, deps.config, request, {
          action: "BANK_ACCOUNT_ADDED",
          targetType: "BANK_ACCOUNT",
          targetId: bankId,
        });
        setFlash(
          reply,
          deps.config,
          "success",
          "Đã thêm và xác thực tài khoản ngân hàng. Bạn có thể rút tiền ngay.",
        );
        return reply.redirect("/app/banks");
      } catch (error) {
        flashError(reply, deps.config, error);
        return reply.redirect(`/app/banks/confirm/${request.params.id}`);
      }
    },
  );

  app.get("/withdrawals", async (request, reply) => {
    const id = userId(request);
    const [balances, accounts, withdrawals] = await Promise.all([
      getWalletBalances(deps.db, id),
      query<{
        id: string;
        bank_code: string;
        account_last4: string;
        account_name_masked: string;
      }>(
        deps.db,
        `
          SELECT id, bank_code, account_last4, account_name_masked
          FROM user_bank_accounts
          WHERE user_id = $1 AND status = 'VERIFIED'
          ORDER BY verified_at DESC NULLS LAST
        `,
        [id],
      ),
      query<{
        id: string;
        amount_vnd: string;
        bank_code: string;
        bank_last4: string;
        status: string;
        rejection_reason: string | null;
        requested_at: Date;
      }>(
        deps.db,
        `
          SELECT id, amount_vnd::text, bank_code, bank_last4, status,
            rejection_reason, requested_at
          FROM withdrawals
          WHERE user_id = $1
          ORDER BY requested_at DESC LIMIT 50
        `,
        [id],
      ),
    ]);
    return reply.view("app/withdrawals.njk", {
      pageTitle: "Rút tiền",
      appSection: "withdrawals",
      balances,
      accounts: accounts.rows,
      withdrawals: withdrawals.rows,
      minimumWithdrawal: deps.config.MIN_WITHDRAWAL_VND,
      maximumWithdrawal: deps.config.MAX_WITHDRAWAL_VND,
      // Trần thật của ô nhập: nhỏ hơn giữa hạn mức mỗi lần rút và số dư khả
      // dụng — chỉ dùng để gợi ý client-side, server vẫn tự kiểm tra lại.
      maxWithdrawable: Math.min(deps.config.MAX_WITHDRAWAL_VND, balances.available),
    });
  });

  app.post("/withdrawals/request", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({
          bankAccountId: z.string().uuid("Tài khoản ngân hàng chưa hợp lệ."),
          amountVnd: z.coerce.number().int().positive("Số tiền chưa hợp lệ."),
        }),
        request.body,
      );
      const intentId = await requestWithdrawal(
        deps.db,
        deps.emailService,
        deps.config,
        {
          userId: userId(request),
          email: request.currentUser!.email,
          bankAccountId: input.bankAccountId,
          amountVnd: input.amountVnd,
        },
      );
      return reply.redirect(`/app/withdrawals/confirm/${intentId}`);
    } catch (error) {
      flashError(reply, deps.config, error);
      return reply.redirect("/app/withdrawals");
    }
  });

  app.get<{ Params: { id: string } }>(
    "/withdrawals/confirm/:id",
    async (request, reply) => {
      const intent = await query<{
        id: string;
        amount_vnd: string;
        bank_code: string;
        account_last4: string;
        expires_at: Date;
      }>(
        deps.db,
        `
          SELECT i.id, i.amount_vnd::text, b.bank_code,
            b.account_last4, i.expires_at
          FROM withdrawal_intents i
          JOIN user_bank_accounts b ON b.id = i.bank_account_id
          WHERE i.id = $1 AND i.user_id = $2
            AND i.status = 'OTP_PENDING' AND i.expires_at > now()
        `,
        [request.params.id, userId(request)],
      );
      if (!intent.rows[0]) return reply.redirect("/app/withdrawals");
      return reply.view("app/withdrawal-confirm.njk", {
        pageTitle: "Xác nhận rút tiền",
        appSection: "withdrawals",
        intent: intent.rows[0],
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/withdrawals/confirm/:id",
    async (request, reply) => {
      try {
        const input = parseInput(
          z.object({
            code: z.string().trim().regex(/^\d{6}$/, "Mã OTP gồm 6 chữ số."),
          }),
          request.body,
        );
        await verifyWithdrawalOtp(deps.db, deps.config, {
          intentId: request.params.id,
          userId: userId(request),
          email: request.currentUser!.email,
          code: input.code,
        });
        const withdrawalId = await createWithdrawalFromIntent(
          deps.db,
          request.params.id,
        );
        await writeAuditLog(deps.db, deps.config, request, {
          action: "WITHDRAWAL_CREATED",
          targetType: "WITHDRAWAL",
          targetId: withdrawalId,
        });
        setFlash(
          reply,
          deps.config,
          "success",
          "Yêu cầu rút tiền đã được tạo và đang chờ kiểm tra.",
        );
        return reply.redirect("/app/withdrawals");
      } catch (error) {
        flashError(reply, deps.config, error);
        return reply.redirect(`/app/withdrawals/confirm/${request.params.id}`);
      }
    },
  );

  app.get("/discover", async (request, reply) => {
    const [contentRows, balances] = await Promise.all([
      query<{
        id: string;
        type: string;
        title: string;
        description: string;
        target_url: string | null;
        image_url: string | null;
        badge: string | null;
        category: string;
        published_at: Date;
        platform: string | null;
        price_vnd: string | null;
        original_price_vnd: string | null;
        cashback_rate_bps: number | null;
      }>(
        deps.db,
        `
          SELECT id, type, title, description, target_url, image_url, badge,
            category, published_at, platform, price_vnd::text,
            original_price_vnd::text, cashback_rate_bps
          FROM content_items
          WHERE status = 'PUBLISHED'
          ORDER BY sort_order, published_at DESC
          LIMIT 80
        `,
      ),
      getWalletBalances(deps.db, userId(request)),
    ]);

    const typeLabels: Record<string, string> = {
      VOUCHER: "Voucher",
      PRODUCT: "Sản phẩm",
      TRENDING: "Xu hướng",
      GUIDE: "Hướng dẫn",
      ANNOUNCEMENT: "Thông báo",
    };
    const fallbackCategories: Record<string, string> = {
      VOUCHER: "Voucher",
      PRODUCT: "Nổi bật",
      TRENDING: "Xu hướng",
      GUIDE: "Hướng dẫn",
      ANNOUNCEMENT: "Thông báo",
    };
    const platformLabels: Record<string, string> = {
      SHOPEE: "Shopee",
      TIKTOK: "TikTok Shop",
      LAZADA: "Lazada",
    };

    const items = contentRows.rows.map((row) => {
      const salePrice = row.price_vnd !== null ? Number(row.price_vnd) : null;
      const originalPriceValue =
        row.original_price_vnd !== null ? Number(row.original_price_vnd) : null;
      const originalPrice =
        originalPriceValue !== null &&
        salePrice !== null &&
        originalPriceValue > salePrice
          ? originalPriceValue
          : null;
      const cashbackRate =
        row.cashback_rate_bps !== null
          ? Math.round(row.cashback_rate_bps / 1000) / 10
          : null;
      const cashbackAmount =
        salePrice !== null && row.cashback_rate_bps !== null
          ? Math.floor((salePrice * row.cashback_rate_bps) / 10000)
          : null;
      const platformUpper = row.platform?.toUpperCase() ?? "";
      const category =
        row.category?.trim() || fallbackCategories[row.type] || "Khác";

      return {
        ...row,
        typeKey: row.type.toLowerCase(),
        typeLabel: typeLabels[row.type] ?? row.type,
        category,
        platform: platformUpper.toLowerCase(),
        platformName: platformUpper
          ? platformLabels[platformUpper] ?? row.platform ?? ""
          : "",
        salePrice,
        originalPrice,
        cashbackRate,
        cashbackAmount,
        isProduct: row.type === "PRODUCT",
      };
    });

    const categories = Array.from(
      new Set(items.map((item) => item.category).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "vi"));
    const platforms = Array.from(
      new Set(items.map((item) => item.platform).filter(Boolean)),
    ).map((key) => ({
      key,
      label:
        platformLabels[key.toUpperCase()] ??
        key.charAt(0).toUpperCase() + key.slice(1),
    }));
    const maxCashbackRate = items.reduce(
      (maximum, item) => Math.max(maximum, item.cashbackRate ?? 0),
      0,
    );

    return reply.view("app/discover.njk", {
      pageTitle: "Khám phá",
      appSection: "discover",
      items,
      categories,
      platforms,
      maxCashbackRate,
      productCount: items.filter((item) => item.isProduct).length,
      voucherCount: items.filter((item) => item.type === "VOUCHER").length,
      balances,
    });
  });

  // Trung tâm mạng lưới cá nhân: mình do ai giới thiệu, đã mời những ai,
  // nhận được bao nhiêu từ từng người, cộng tóm tắt mua sắm của chính mình.
  app.get("/referrals", async (request, reply) => {
    const id = userId(request);
    const [referrals, mySource, myEarnings, myShopping] = await Promise.all([
      query<{
        full_name: string;
        status: string;
        created_at: Date;
        approved_orders: string;
        earned_vnd: string;
      }>(
        deps.db,
        `
          SELECT u.full_name, r.status, r.created_at,
            (SELECT count(*) FROM orders o
              WHERE o.user_id = u.id AND o.status = 'APPROVED')::text
              AS approved_orders,
            COALESCE((SELECT sum(ce.referral_amount_vnd)
              FROM commission_entries ce
              JOIN orders o2 ON o2.id = ce.order_id
              WHERE ce.sharer_user_id = $1 AND o2.user_id = u.id
                AND ce.status = 'AVAILABLE'), 0)::text AS earned_vnd
          FROM referrals r
          JOIN users u ON u.id = r.referred_user_id
          WHERE r.referrer_user_id = $1
          ORDER BY r.created_at DESC
        `,
        [id],
      ),
      query<{ full_name: string | null }>(
        deps.db,
        `
          SELECT referrer.full_name
          FROM users u
          LEFT JOIN users referrer ON referrer.id = u.referred_by_user_id
          WHERE u.id = $1
        `,
        [id],
      ),
      query<{ total_vnd: string; rewarded_count: string }>(
        deps.db,
        `
          SELECT COALESCE(sum(ce.referral_amount_vnd), 0)::text AS total_vnd,
            count(DISTINCT o.user_id) FILTER (WHERE ce.referral_amount_vnd > 0)::text
              AS rewarded_count
          FROM commission_entries ce
          JOIN orders o ON o.id = ce.order_id
          WHERE ce.sharer_user_id = $1 AND ce.status = 'AVAILABLE'
        `,
        [id],
      ),
      query<{ orders_count: string; cashback_vnd: string }>(
        deps.db,
        `
          SELECT count(*)::text AS orders_count,
            COALESCE(sum(cashback_vnd) FILTER (WHERE status = 'APPROVED'), 0)::text
              AS cashback_vnd
          FROM orders
          WHERE user_id = $1
            AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')
        `,
        [id],
      ),
    ]);
    return reply.view("app/referrals.njk", {
      pageTitle: "Mạng lưới của tôi",
      appSection: "referrals",
      referrals: referrals.rows,
      referredByName: mySource.rows[0]?.full_name ?? null,
      networkEarnings: myEarnings.rows[0] ?? {
        total_vnd: "0",
        rewarded_count: "0",
      },
      myShopping: myShopping.rows[0] ?? {
        orders_count: "0",
        cashback_vnd: "0",
      },
      referralUrl: `${deps.config.APP_ORIGIN}/dang-ky?ref=${request.currentUser!.referralCode}`,
      referralCode: request.currentUser!.referralCode,
    });
  });

  app.get("/nhiem-vu", async (request, reply) => {
    const missions = await getUserMissionOverview(deps.db, userId(request));
    return reply.view("app/missions.njk", {
      pageTitle: "Nhiệm vụ",
      appSection: "missions",
      referralGroup: missions.REFERRAL_MILESTONE,
      purchaseGroup: missions.PURCHASE_MILESTONE,
    });
  });

  app.post("/nhiem-vu/claim", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const missionDefinitionId = String(body.missionDefinitionId ?? "");
      await claimMissionReward(deps.db, userId(request), missionDefinitionId);
      setFlash(
        reply,
        deps.config,
        "success",
        "Đã gửi yêu cầu nhận thưởng, đang chờ ShopTik duyệt.",
      );
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/app/nhiem-vu");
  });

  app.post("/notifications/mark-read", async (request, reply) => {
    await markAllNotificationsRead(deps.db, userId(request));
    return reply.send({ ok: true });
  });

  // Hỗ trợ gồm hai đường: form theo mẫu (chọn vấn đề + đơn hàng liên quan)
  // và chat trực tiếp. Cả hai cùng đổ vào một hội thoại, ánh xạ thread Slack
  // CSKH; nhân viên trả lời trong thread và câu trả lời hiện lại ở trang này.
  app.get("/support", async (request, reply) => {
    const uid = userId(request);
    const businessConfig = await getBusinessConfig(deps.db, deps.config);
    const [messages, orderHistory, conversationRow] = await Promise.all([
      listSupportChatMessages(deps.db, uid),
      listOrderHistory(deps.db, {
        userId: uid,
        status: "ALL",
        released: "ALL",
        searchTerm: "",
        attributionDays: businessConfig.affiliateAttributionDays,
        limit: 50,
      }),
      query<{ notify_email: string }>(
        deps.db,
        `SELECT notify_email FROM support_conversations WHERE user_id = $1`,
        [uid],
      ),
    ]);
    const dateFormat = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      dateStyle: "short",
    });
    const orderOptions = orderHistory.map((row) => ({
      key: `${row.record_kind}:${row.id}`,
      label: [
        platformDisplayName(row.platform),
        row.platform_order_id
          ? `#${row.platform_order_id}`
          : `mua ngày ${dateFormat.format(new Date(row.purchased_at ?? row.created_at))}`,
        row.product_name
          ? row.product_name.length > 48
            ? `${row.product_name.slice(0, 47)}…`
            : row.product_name
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

    // Đi từ trang Đơn hàng sang: chọn sẵn đơn đó trong form theo mẫu; nếu
    // không khớp được bản ghi nào thì lùi về điền sẵn tin nhắn chat như cũ.
    const queryParams = request.query as Record<string, unknown>;
    const requestedOrderId = String(queryParams.orderId ?? "").trim();
    const requestedPlatform = String(queryParams.platform ?? "")
      .trim()
      .toUpperCase();
    const preselected = requestedOrderId
      ? orderHistory.find(
          (row) => row.platform_order_id === requestedOrderId,
        )
      : undefined;
    const platformLabel = requestedPlatform
      ? platformDisplayName(requestedPlatform)
      : "";
    return reply.view("app/support.njk", {
      pageTitle: "Hỗ trợ",
      appSection: "support",
      messages,
      chatOnline: isSlackSupportEnabled(deps.config),
      supportTopics: SUPPORT_TOPICS,
      orderOptions,
      notifyEmail:
        conversationRow.rows[0]?.notify_email ||
        request.currentUser!.email,
      preselectOrderKey: preselected
        ? `${preselected.record_kind}:${preselected.id}`
        : "",
      prefillMessage:
        requestedOrderId && !preselected
          ? `Nhờ kiểm tra và hỗ trợ đơn #${requestedOrderId}${platformLabel ? ` trên ${platformLabel}` : ""}.`
          : "",
    });
  });

  // Form theo mẫu: validate loại vấn đề + đơn hàng rồi gửi vào hội thoại chat.
  app.post("/support/requests", async (request, reply) => {
    try {
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
        userId: userId(request),
        userEmail: request.currentUser!.email,
        userFullName: request.currentUser!.fullName,
        topic: input.topic,
        ...(input.orderKey ? { orderKey: input.orderKey } : {}),
        ...(input.orderCode ? { orderCode: input.orderCode } : {}),
        description: input.description,
        ...(input.notifyEmail !== undefined
          ? { notifyEmail: input.notifyEmail }
          : {}),
        logger: request.log,
      });
      reply.header("cache-control", "private, no-store");
      return reply.code(201).send({ message });
    } catch (error) {
      // Endpoint này được gọi bằng fetch — luôn trả JSON thay vì trang lỗi HTML.
      const appError = asAppError(error);
      if (appError.statusCode >= 500) {
        request.log.error({ err: error }, "Lỗi gửi yêu cầu hỗ trợ");
      }
      return reply.code(appError.statusCode).send({
        error: { code: appError.code, message: appError.message },
      });
    }
  });

  app.post("/support/messages", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({ body: z.string().trim().min(1).max(3000) }),
        request.body,
      );
      const message = await sendSupportChatMessage(deps.db, deps.config, {
        userId: userId(request),
        userEmail: request.currentUser!.email,
        userFullName: request.currentUser!.fullName,
        body: input.body,
        logger: request.log,
      });
      reply.header("cache-control", "private, no-store");
      return reply.code(201).send({ message });
    } catch (error) {
      // Endpoint này được gọi bằng fetch — luôn trả JSON thay vì trang lỗi HTML.
      const appError = asAppError(error);
      if (appError.statusCode >= 500) {
        request.log.error({ err: error }, "Lỗi gửi tin nhắn hỗ trợ");
      }
      return reply.code(appError.statusCode).send({
        error: { code: appError.code, message: appError.message },
      });
    }
  });

  app.get("/support/messages", async (request, reply) => {
    const messages = await listSupportChatMessages(deps.db, userId(request));
    reply.header("cache-control", "private, no-store");
    return reply.send({ messages });
  });

  app.get("/settings", async (request, reply) => {
    const currentTokenHash = request.sessionToken
      ? sha256(request.sessionToken)
      : null;
    const sessions = await query<{
      id: string;
      token_hash: string;
      last_seen_at: Date;
      expires_at: Date;
      created_at: Date;
    }>(
      deps.db,
      `
        SELECT id, token_hash, last_seen_at, expires_at, created_at
        FROM sessions
        WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY last_seen_at DESC
      `,
      [userId(request)],
    );
    return reply.view("app/settings.njk", {
      pageTitle: "Tài khoản và bảo mật",
      appSection: "settings",
      sessions: sessions.rows.map((row) => ({
        ...row,
        is_current: currentTokenHash === row.token_hash,
      })),
    });
  });

  app.post("/settings/profile", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({
          fullName: z.string().trim().min(2).max(100),
        }),
        request.body,
      );
      await query(deps.db, "UPDATE users SET full_name = $2 WHERE id = $1", [
        userId(request),
        input.fullName,
      ]);
      setFlash(reply, deps.config, "success", "Đã lưu tên hiển thị.");
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/app/settings");
  });

  app.post("/settings/revoke-all", async (request, reply) => {
    const id = userId(request);
    await revokeAllUserSessions(deps.db, id);
    await revokeCurrentSession(deps.db, deps.config, request, reply);
    setFlash(
      reply,
      deps.config,
      "success",
      "Đã đăng xuất tất cả thiết bị.",
    );
    return reply.redirect("/dang-nhap");
  });

}
