import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isGuestAppPath, requireUser } from "../auth/guards.js";
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
import { resolveBuyerPercent } from "../services/commission.js";
import {
  fetchLazadaOfferPage,
  isLazadaAffiliateConfigured,
} from "../services/lazada-affiliate-api.js";
import {
  getStoredLazadaOffers,
  getStoredLazadaOffersCount,
} from "../services/lazada-offer-store.js";
import { listOrderHistory } from "../services/order-history.js";
import { listShopeeVouchers } from "../services/shopee-voucher.js";
import {
  getKolFile,
  getUserKolApplication,
  getUserKolStatus,
  submitKolApplication,
  type KolFileKind,
} from "../services/kol-application.js";
import {
  multipartBuffer,
  sniffMime,
  toDisplayableImage,
} from "../services/kyc-upload.js";
import {
  KOL_AGREEMENT_SECTIONS,
  KOL_AGREEMENT_VERSION,
} from "../services/kol-agreement.js";
import { listViewedProducts } from "../services/viewed-products.js";
import { createPurchaseIntent } from "../services/affiliate.js";
import { getAppDashboard, getGuestDashboard } from "../services/app-dashboard.js";
import { getCheckinState, recordDailyCheckin } from "../services/checkin.js";
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
  countUnreadSupportReplies,
  getLatestSupportExchange,
  getLatestUnreadSupportReply,
  listSupportChatMessages,
  markSupportRead,
  sendSupportChatMessage,
} from "../services/support-chat.js";
import {
  SUPPORT_TOPICS,
  platformDisplayName,
  submitSupportRequest,
  toSupportOrderOption,
} from "../services/support-request.js";
import {
  BEST_SELLER_LIST_TYPE,
  EXCLUSIVE_LIST_TYPE,
  HOT_DEALS_LIST_TYPE,
  OFFER_PAGE_SIZE,
  RECOMMEND_LIST_TYPE,
  enqueueOfferPageFetch,
  getHarvestSettings,
  getKnownOfferPageCount,
  getStoredOfferPage,
  hasOfferPage,
  isWorkerOnline,
  type StoredOfferProduct,
} from "../services/discover-harvest.js";
import { isSlackSupportEnabled } from "../services/slack.js";
import {
  applyReferralToUser,
  getReferralCodeState,
  requestReferralCodeChange,
} from "../services/referral-code.js";
import {
  claimMissionReward,
  getUnreadNotificationCount,
  WEB_BELL_EXCLUDED_TYPES,
  getUserMissionOverview,
  listNotifications,
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
  // KHÁCH (chưa đăng nhập) xem được trang chủ (dán link kiểm tra hoàn tiền),
  // Khám phá và Hỗ trợ — danh sách ở GUEST_APP_PATHS (auth/guards.ts); mọi
  // route khác trong /app và mọi POST vẫn bắt đăng nhập.
  app.addHook("preHandler", async (request, reply) => {
    if (isGuestAppPath(request.method, request.url)) return;
    return requireUser(request, reply);
  });

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
    const dashboard = request.currentUser
      ? await getAppDashboard(deps.db, deps.config, request.currentUser.id)
      : await getGuestDashboard(deps.db, deps.config);
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
      // "Sản phẩm đã xem" là MỘT tab ngay trong trang Đơn hàng (giữ hàng tab
      // để chuyển qua lại), không phải trang riêng.
      "VIEWED",
    ];
    const status = allowedStatuses.includes(String(queryParams.status))
      ? String(queryParams.status)
      : "ALL";
    const searchTerm = String(queryParams.q ?? "").trim().slice(0, 120);

    // Tab "Sản phẩm đã xem": hiển thị các lượt đã bấm Mua ngay thay cho danh
    // sách đơn, nhưng vẫn trong cùng trang + cùng hàng tab.
    if (status === "VIEWED") {
      const viewedItems = await listViewedProducts(deps.db, userId(request));
      return reply.view("app/orders.njk", {
        pageTitle: "Sản phẩm đã xem",
        appSection: "orders",
        orders: [],
        viewedItems,
        selectedStatus: status,
        searchTerm: "",
      });
    }

    const filterStatus = status === "PAID" ? "APPROVED" : status;
    // Tab "Đã về ví" chỉ gồm đơn đã hết thời gian giữ tiền và đã cộng vào
    // số dư khả dụng; tab "Đã duyệt" là đơn hoàn thành còn đang chờ.
    const releasedFilter =
      status === "PAID" ? "RELEASED" : status === "APPROVED" ? "HELD" : "ALL";
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
      viewedItems: [],
      selectedStatus: status,
      searchTerm,
    });
  });

  // Tương thích link cũ: /app/viewed → tab "Sản phẩm đã xem" trong Đơn hàng.
  app.get("/viewed", async (_request, reply) => {
    return reply.redirect("/app/orders?status=VIEWED");
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
    const [contentRows, balances, featuredStoreRows] = await Promise.all([
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
      // Khách xem Khám phá không có ví — bỏ qua, template không cần số dư.
      request.currentUser
        ? getWalletBalances(deps.db, request.currentUser.id)
        : null,
      query<{
        shop_name: string;
        product_count: string;
        image_url: string | null;
        sales_count: string | null;
      }>(
        deps.db,
        `
          SELECT shop_name, count(*)::text AS product_count,
            max(image_url) AS image_url, max(sales_count)::text AS sales_count
          FROM shopee_offer_products
          WHERE shop_name IS NOT NULL AND btrim(shop_name) <> ''
          GROUP BY shop_name
          ORDER BY max(sales_count) DESC NULLS LAST, count(*) DESC, shop_name
          LIMIT 6
        `,
      ),
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
      // bps → phần trăm, giữ 1 chữ số thập phân (560 bps = 5.6%).
      const cashbackRate =
        row.cashback_rate_bps !== null
          ? Math.round(row.cashback_rate_bps / 10) / 10
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
    )
      // "Đề xuất" đã có nút danh mục sống (phân trang trực tiếp từ Shopee)
      // — bỏ nút trùng tên sinh từ bài viết tĩnh.
      .filter((category) => category !== "Đề xuất")
      .sort((left, right) => left.localeCompare(right, "vi"));
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

    const featuredStores = featuredStoreRows.rows.map((row) => ({
      name: row.shop_name,
      productCount: Number(row.product_count),
      imageUrl: row.image_url,
      salesCount: row.sales_count !== null ? Number(row.sales_count) : null,
    }));

    return reply.view("app/discover.njk", {
      pageTitle: "Khám phá",
      appSection: "discover",
      items,
      categories,
      platforms,
      featuredStores,
      maxCashbackRate,
      productCount: items.filter((item) => item.isProduct).length,
      voucherCount: items.filter((item) => item.type === "VOUCHER").length,
      balances,
    });
  });

  // Hai danh mục sống trong "◇ Danh mục" của trang Khám phá:
  // list=recommend (Đề xuất, list_type=0) và list=best (Bán chạy, list_type=2).
  // Dữ liệu theo trang, cache-first — trang chưa có thì xếp lệnh FETCH_PAGE
  // cho profile-worker và trả FETCHING để client poll.
  const mapOfferProduct = (
    row: StoredOfferProduct,
    buyerCashbackPercent: number,
  ) => {
    const priceVnd = row.price_vnd !== null ? Number(row.price_vnd) : null;
    const cashbackBps =
      row.commission_rate_bps !== null
        ? Math.floor((row.commission_rate_bps * buyerCashbackPercent) / 100)
        : null;
    return {
      name: row.name,
      imageUrl: row.image_url,
      priceVnd,
      cashbackAmountVnd:
        priceVnd !== null && cashbackBps !== null
          ? Math.floor((priceVnd * cashbackBps) / 10000)
          : null,
      cashbackRatePercent:
        cashbackBps !== null ? Math.round(cashbackBps / 10) / 10 : null,
      shopName: row.shop_name,
      salesCount: row.sales_count !== null ? Number(row.sales_count) : null,
      productUrl: row.product_url,
      originalPriceVnd:
        row.original_price_vnd !== null ? Number(row.original_price_vnd) : null,
      discountPercent: row.discount_percent,
    };
  };

  // Ánh xạ tên danh mục sống → list_type Shopee.
  const OFFER_LIST_TYPES: Record<string, number> = {
    recommend: RECOMMEND_LIST_TYPE,
    best: BEST_SELLER_LIST_TYPE,
    exclusive: EXCLUSIVE_LIST_TYPE,
    hot: HOT_DEALS_LIST_TYPE,
  };

  // Voucher Shopee hôm nay cho tab Voucher (web).
  app.get("/discover/vouchers", async (_request, reply) => {
    reply.header("cache-control", "private, max-age=300");
    return reply.send({ data: await listShopeeVouchers(deps.db, 300) });
  });

  app.get("/discover/offer-products", async (request, reply) => {
    const queryParams = request.query as Record<string, unknown>;
    const listType =
      OFFER_LIST_TYPES[String(queryParams.list ?? "best")] ??
      BEST_SELLER_LIST_TYPE;
    const parsedPage = Number.parseInt(String(queryParams.page ?? "1"), 10);
    const pageNo = Math.min(
      Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1),
      100,
    );
    reply.header("cache-control", "private, no-store");

    if (await hasOfferPage(deps.db, listType, pageNo)) {
      const [rows, knownPages, businessConfig] = await Promise.all([
        getStoredOfferPage(deps.db, listType, pageNo),
        getKnownOfferPageCount(deps.db, listType),
        getBusinessConfig(deps.db, deps.config),
      ]);
      return reply.send({
        status: "READY",
        page: pageNo,
        knownPages,
        pageSize: OFFER_PAGE_SIZE,
        products: rows.map((row) =>
          mapOfferProduct(row, businessConfig.buyerCashbackPercent),
        ),
      });
    }

    // Kho HOT chỉ được nạp bởi lịch 1h sáng / nút thủ công (directFetchHotDeals),
    // KHÔNG enqueue lấy trang như offer thường.
    if (listType === HOT_DEALS_LIST_TYPE) {
      return reply.send({
        status: "UNAVAILABLE",
        page: pageNo,
        message: "Deal Hot đang được cập nhật. Vui lòng quay lại sau.",
      });
    }
    const settings = await getHarvestSettings(deps.db);
    if (!isWorkerOnline(settings)) {
      return reply.send({
        status: "UNAVAILABLE",
        page: pageNo,
        message:
          "Hệ thống lấy dữ liệu Shopee đang tạm nghỉ. Vui lòng quay lại sau.",
      });
    }
    try {
      await enqueueOfferPageFetch(deps.db, listType, pageNo);
      return reply.send({ status: "FETCHING", page: pageNo });
    } catch (error) {
      const appError = asAppError(error);
      return reply.send({
        status: "UNAVAILABLE",
        page: pageNo,
        message: appError.message,
      });
    }
  });

  // Sản phẩm affiliate LAZADA cho mục Khám phá (menu con Lazada của Hot/Bán
  // chạy/Đề xuất). Nguồn: API affiliate /marketing/product/feed — hoa hồng
  // THẬT theo sản phẩm. API không có tham số sort nên server sắp xếp trong
  // trang: hot = hoa hồng cao nhất, best = bán chạy 7 ngày. Tiền hoàn tính
  // theo tỷ lệ người mua (đơn < 25k nhận 80%, còn lại 60%).
  app.get("/discover/lazada-offers", async (request, reply) => {
    reply.header("cache-control", "private, max-age=120");
    const queryParams = request.query as Record<string, unknown>;
    const list = String(queryParams.list ?? "recommend");
    const parsedPage = Number.parseInt(String(queryParams.page ?? "1"), 10);
    const pageNo = Math.min(
      Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1),
      100,
    );

    // Ưu tiên đọc từ KHO (lazada_offer_products) — được job 1h sáng lưu sẵn.
    // Kho rỗng (chưa refresh lần nào / trang vượt kho) thì lấy trực tiếp API.
    const [stored, businessConfig] = await Promise.all([
      getStoredLazadaOffers(deps.db, {
        list,
        page: pageNo,
        pageSize: OFFER_PAGE_SIZE,
      }),
      getBusinessConfig(deps.db, deps.config),
    ]);

    interface NormalizedOffer {
      name: string;
      imageUrl: string | null;
      priceVnd: number | null;
      commissionRateBps: number | null;
      commissionVnd: number | null;
      shopName: string | null;
      salesCount: number | null;
      productUrl: string;
    }
    let source: NormalizedOffer[];
    let knownPages = pageNo;

    if (stored.length) {
      source = stored.map((r) => ({
        name: r.name,
        imageUrl: r.image_url,
        priceVnd: r.price_vnd !== null ? Number(r.price_vnd) : null,
        commissionRateBps: r.commission_rate_bps,
        commissionVnd: r.commission_vnd !== null ? Number(r.commission_vnd) : null,
        shopName: r.shop_name,
        salesCount: r.sales_count,
        productUrl: r.product_url,
      }));
      const total = await getStoredLazadaOffersCount(deps.db);
      knownPages = Math.max(1, Math.ceil(total / OFFER_PAGE_SIZE));
    } else {
      if (!isLazadaAffiliateConfigured(deps.config)) {
        return reply.send({
          status: "UNAVAILABLE",
          page: pageNo,
          message: "Sản phẩm Lazada đang được cập nhật. Vui lòng quay lại sau.",
        });
      }
      const live = await fetchLazadaOfferPage(deps.config, {
        page: pageNo,
        limit: OFFER_PAGE_SIZE,
      });
      const sorted = live.slice();
      if (list === "hot") {
        sorted.sort((a, b) => (b.commissionVnd ?? 0) - (a.commissionVnd ?? 0));
      } else if (list === "best") {
        sorted.sort((a, b) => (b.salesCount ?? 0) - (a.salesCount ?? 0));
      }
      source = sorted;
    }

    const mapped = source.map((p) => {
      const buyerPercent = resolveBuyerPercent(p.priceVnd, businessConfig);
      const cashbackBps =
        p.commissionRateBps !== null
          ? Math.floor((p.commissionRateBps * buyerPercent) / 100)
          : null;
      const cashbackAmountVnd =
        p.commissionVnd !== null
          ? Math.floor((p.commissionVnd * buyerPercent) / 100)
          : p.priceVnd !== null && cashbackBps !== null
            ? Math.floor((p.priceVnd * cashbackBps) / 10000)
            : null;
      return {
        name: p.name,
        imageUrl: p.imageUrl,
        priceVnd: p.priceVnd,
        cashbackAmountVnd,
        cashbackRatePercent:
          cashbackBps !== null ? Math.round(cashbackBps / 10) / 10 : null,
        shopName: p.shopName,
        salesCount: p.salesCount,
        productUrl: p.productUrl,
        originalPriceVnd: null,
        discountPercent: null,
        platform: "lazada",
      };
    });
    return reply.send({
      status: "READY",
      page: pageNo,
      knownPages,
      pageSize: OFFER_PAGE_SIZE,
      products: mapped,
    });
  });

  // Băng chuyền quảng cáo trang chủ: nhiều sản phẩm NGẪU NHIÊN từ danh mục
  // Bán chạy (cache DB). Nút mua đi qua luồng affiliate như thẻ Khám phá.
  // Điểm danh: đọc trạng thái (lịch + chuỗi) và ghi điểm danh hôm nay.
  app.get("/checkin", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    return reply.send(await getCheckinState(deps.db, userId(request)));
  });
  app.post("/checkin", async (request, reply) => {
    return reply.send(await recordDailyCheckin(deps.db, userId(request)));
  });

  app.get("/promo-products", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const queryParams = request.query as Record<string, unknown>;
    const limit = Math.min(
      Math.max(Number.parseInt(String(queryParams.limit ?? "16"), 10) || 16, 4),
      24,
    );
    // Cho phép chọn mục: Đề xuất / Bán chạy / Độc quyền (mặc định Bán chạy).
    const listTypeByList: Record<string, number> = {
      recommend: RECOMMEND_LIST_TYPE,
      best: BEST_SELLER_LIST_TYPE,
      exclusive: EXCLUSIVE_LIST_TYPE,
    };
    const listType =
      listTypeByList[String(queryParams.list ?? "best")] ?? BEST_SELLER_LIST_TYPE;
    const [rows, businessConfig] = await Promise.all([
      query<StoredOfferProduct>(
        deps.db,
        `
          SELECT item_id, name, image_url, price_vnd::text, commission_rate_bps,
            shop_name, product_url, sales_count::text
          FROM shopee_offer_products
          WHERE list_type = $1 AND image_url IS NOT NULL
          ORDER BY random()
          LIMIT $2
        `,
        [listType, limit],
      ),
      getBusinessConfig(deps.db, deps.config),
    ]);
    return reply.send({
      products: rows.rows.map((row) =>
        mapOfferProduct(row, businessConfig.buyerCashbackPercent),
      ),
    });
  });

  // Trung tâm mạng lưới cá nhân: mình do ai giới thiệu, đã mời những ai,
  // nhận được bao nhiêu từ từng người, cộng tóm tắt mua sắm của chính mình.
  app.get("/referrals", async (request, reply) => {
    const id = userId(request);
    const [referrals, mySource, myEarnings, myShopping, kolStatus] =
      await Promise.all([
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
      getUserKolStatus(deps.db, id),
    ]);
    return reply.view("app/referrals.njk", {
      pageTitle: "Mạng lưới của tôi",
      appSection: "referrals",
      kolStatus,
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
      refCodeState: await getReferralCodeState(deps.db, id),
    });
  });

  // Đối tác/KOL xin đổi mã giới thiệu tự chọn (chờ admin duyệt).
  app.post("/referrals/doi-ma", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({ newCode: z.string().trim().min(1).max(20) }),
        request.body,
      );
      await requestReferralCodeChange(deps.db, userId(request), input.newCode);
      setFlash(
        reply,
        deps.config,
        "success",
        "Đã gửi yêu cầu đổi mã. Admin duyệt xong bạn sẽ nhận được thông báo.",
      );
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/app/referrals");
  });

  // Tài khoản mới qua Google chưa có chỗ nhập mã giới thiệu — trang này bù vào.
  app.get("/nhap-gioi-thieu", async (request, reply) => {
    const id = userId(request);
    const me = await query<{ referred_by_user_id: string | null }>(
      deps.db,
      "SELECT referred_by_user_id FROM users WHERE id = $1",
      [id],
    );
    if (me.rows[0]?.referred_by_user_id) return reply.redirect("/app");
    return reply.view("app/nhap-gioi-thieu.njk", {
      pageTitle: "Mã giới thiệu",
      appSection: "referrals",
    });
  });

  app.post("/nhap-gioi-thieu", async (request, reply) => {
    try {
      const input = parseInput(
        z.object({ referralCode: z.string().trim().min(1).max(20) }),
        request.body,
      );
      const ok = await applyReferralToUser(
        deps.db,
        userId(request),
        input.referralCode,
      );
      if (!ok) {
        setFlash(
          reply,
          deps.config,
          "error",
          "Mã giới thiệu không tồn tại hoặc không dùng được. Kiểm tra lại nhé.",
        );
        return reply.redirect("/app/nhap-gioi-thieu");
      }
      setFlash(reply, deps.config, "success", "Đã ghi nhận người giới thiệu của bạn.");
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/app");
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
    // Khách xem được trang Hỗ trợ (mẫu yêu cầu, cách liên hệ) nhưng không có
    // hội thoại/đơn hàng; form khóa và mời đăng nhập — các POST bên dưới vẫn
    // bắt đăng nhập qua preHandler chung.
    if (!request.currentUser) {
      return reply.view("app/support.njk", {
        pageTitle: "Hỗ trợ",
        appSection: "support",
        guest: true,
        messages: [],
        latestRequest: null,
        latestReply: null,
        chatOnline: isSlackSupportEnabled(deps.config),
        supportTopics: SUPPORT_TOPICS,
        orderOptions: [],
        notifyEmail: "",
        preselectOrderKey: "",
        prefillMessage: "",
      });
    }
    const uid = userId(request);
    const businessConfig = await getBusinessConfig(deps.db, deps.config);
    const [messages, orderHistory, conversationRow, latestExchange] =
      await Promise.all([
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
      getLatestSupportExchange(deps.db, uid),
    ]);
    const orderOptions = orderHistory.map(toSupportOrderOption);

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
    // Mở trang hỗ trợ = đã xem mọi phản hồi CSKH tới lúc này.
    await markSupportRead(deps.db, uid);
    return reply.view("app/support.njk", {
      pageTitle: "Hỗ trợ",
      appSection: "support",
      messages,
      latestRequest: latestExchange.request,
      latestReply: latestExchange.reply,
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
    const uid = userId(request);
    const messages = await listSupportChatMessages(deps.db, uid);
    // Đang xem hỗ trợ → coi như đã đọc mọi phản hồi CSKH tới lúc này.
    await markSupportRead(deps.db, uid);
    reply.header("cache-control", "private, no-store");
    return reply.send({ messages });
  });

  // Đếm phản hồi CSKH chưa xem — cho linh vật poll nhẹ trên mọi trang app.
  app.get("/support/unread", async (request, reply) => {
    const count = await countUnreadSupportReplies(deps.db, userId(request));
    reply.header("cache-control", "private, no-store");
    return reply.send({ count });
  });

  // Trao đổi mới nhất (yêu cầu + phản hồi) để cập nhật bảng "Phản Hồi" realtime.
  // Đang xem trang hỗ trợ → coi như đã đọc.
  app.get("/support/latest", async (request, reply) => {
    const uid = userId(request);
    const ex = await getLatestSupportExchange(deps.db, uid);
    await markSupportRead(deps.db, uid);
    reply.header("cache-control", "private, no-store");
    return reply.send({
      request: ex.request
        ? { body: ex.request.body, at: ex.request.createdAt }
        : null,
      reply: ex.reply ? { body: ex.reply.body, at: ex.reply.createdAt } : null,
    });
  });

  // Trạng thái thông báo cho linh vật/chuông: số chưa đọc + danh sách gần đây +
  // số phản hồi CSKH. Poll trên mọi trang để cập nhật KHÔNG cần tải lại.
  app.get("/notifications/state", async (request, reply) => {
    const uid = userId(request);
    const [notif, support, items, supportPreview] = await Promise.all([
      getUnreadNotificationCount(deps.db, uid, {
        excludeTypes: WEB_BELL_EXCLUDED_TYPES,
      }),
      countUnreadSupportReplies(deps.db, uid),
      listNotifications(deps.db, uid, 8),
      getLatestUnreadSupportReply(deps.db, uid),
    ]);
    reply.header("cache-control", "private, no-store");
    return reply.send({
      notif,
      support,
      supportPreview,
      items: items.map((i) => ({
        title: i.title,
        body: i.body,
        isRead: i.isRead,
        createdAt: i.createdAt,
      })),
    });
  });

  /*
   * Tách làm HAI trang thay vì gộp một:
   *   /app/settings — "Chức năng": chỉ là bảng điều hướng tới mọi khu vực.
   *   /app/profile  — "Thông tin cá nhân": hồ sơ, bảo mật, phiên đăng nhập.
   * Gộp chung thì một trang vừa là chỗ ĐI ĐÂU vừa là chỗ SỬA GÌ, càng thêm
   * trường hồ sơ (ảnh đại diện, số điện thoại...) càng dài và lẫn lộn.
   */
  app.get("/settings", async (_request, reply) => {
    return reply.view("app/settings.njk", {
      pageTitle: "Chức năng",
      appSection: "settings",
      appOrigin: deps.config.APP_ORIGIN,
    });
  });

  // ── Đăng ký KOL/KOC ──────────────────────────────────────────────────
  // Bước 1: điều khoản + tích xác nhận. Đã duyệt thì hiện lại hồ sơ + hợp đồng.
  app.get("/dang-ky-kol", async (request, reply) => {
    const app0 = await getUserKolApplication(deps.db, userId(request));
    if (app0 && app0.status === "APPROVED") {
      return reply.view("app/kol-approved.njk", {
        pageTitle: "Đối tác KOL/KOC",
        appSection: "referrals",
        a: app0,
      });
    }
    return reply.view("app/kol-terms.njk", {
      pageTitle: "Đăng ký KOL/KOC",
      appSection: "referrals",
      sections: KOL_AGREEMENT_SECTIONS,
      agreementVersion: KOL_AGREEMENT_VERSION,
      pendingStatus: app0?.status ?? null,
    });
  });

  // Xem file KYC/hợp đồng của CHÍNH người dùng (sau khi được duyệt).
  app.get<{ Params: { kind: string } }>(
    "/dang-ky-kol/file/:kind",
    async (request, reply) => {
      const kind = request.params.kind.toUpperCase();
      if (
        !["CCCD_FRONT", "CCCD_BACK", "FACE_VIDEO", "CONTRACT_PDF"].includes(kind)
      ) {
        return reply.code(404).send("Không tìm thấy.");
      }
      const app0 = await getUserKolApplication(deps.db, userId(request));
      if (!app0) return reply.code(404).send("Không tìm thấy hồ sơ.");
      const file = await getKolFile(deps.db, app0.id, kind as KolFileKind);
      if (!file) return reply.code(404).send("Không tìm thấy file.");
      reply.header("content-type", file.contentType);
      reply.header("cache-control", "private, no-store");
      reply.header("content-disposition", "inline");
      return reply.send(file.content);
    },
  );

  // Bước 2: form thông tin + KYC (chỉ vào được khi đã tích điều khoản).
  app.get("/dang-ky-kol/thong-tin", async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    if (q.dong_y !== "1") return reply.redirect("/app/dang-ky-kol");
    const kol = await getUserKolStatus(deps.db, userId(request));
    // Đang chờ hoặc đã là đối tác thì không cho điền lại.
    if (kol.status === "PENDING" || kol.status === "APPROVED") {
      return reply.redirect("/app/dang-ky-kol");
    }
    return reply.view("app/kol-form.njk", {
      pageTitle: "Hồ sơ KOL/KOC",
      appSection: "referrals",
      agreementVersion: KOL_AGREEMENT_VERSION,
      banks: BANKS,
    });
  });

  app.post("/dang-ky-kol", async (request, reply) => {
    try {
      const body = request.body as Record<string, unknown>;
      if (!body.acceptTerms) {
        throw new AppError("KOL_TERMS", "Bạn cần đồng ý điều khoản.", 400);
      }
      const str = (k: string): string | undefined => {
        const v = body[k];
        return typeof v === "string" && v.trim() ? v.trim() : undefined;
      };
      // Ngày cấp + Nơi cấp và Chủ TK + Ngân hàng nhập tách rời trên form nhưng
      // lưu gộp lại (khớp ô gộp trong mẫu hợp đồng).
      const join = (a?: string, b?: string, sep = " · "): string | undefined => {
        const parts = [a, b].filter(Boolean) as string[];
        return parts.length ? parts.join(sep) : undefined;
      };
      const cccdIssue = join(str("cccdIssueDate"), str("cccdIssuePlace"));
      const bankName = join(str("bankHolder"), str("bankName"), " - ");
      const fileDefs = [
        { kind: "CCCD_FRONT" as const, field: "cccdFront", isImage: true },
        { kind: "CCCD_BACK" as const, field: "cccdBack", isImage: true },
        { kind: "FACE_VIDEO" as const, field: "faceVideo", isImage: false },
      ];
      const files: {
        kind: "CCCD_FRONT" | "CCCD_BACK" | "FACE_VIDEO";
        contentType: string;
        buffer: Buffer;
      }[] = [];
      for (const f of fileDefs) {
        const buf = multipartBuffer(body[f.field]);
        if (!buf) continue;
        const mime = sniffMime(buf);
        if (f.isImage) {
          // Ảnh CCCD: đảm bảo hiển thị được (HEIC iPhone → JPEG).
          const img = await toDisplayableImage(buf, mime);
          files.push({
            kind: f.kind,
            contentType: img.contentType,
            buffer: img.buffer,
          });
        } else {
          files.push({ kind: f.kind, contentType: mime, buffer: buf });
        }
      }

      await submitKolApplication(
        deps.db,
        userId(request),
        {
          fullName: str("fullName") ?? "",
          birthDate: str("birthDate"),
          cccdNumber: str("cccdNumber") ?? "",
          cccdIssue,
          address: str("address"),
          phone: str("phone") ?? "",
          email: str("email"),
          taxCode: str("taxCode"),
          bankAccount: str("bankAccount"),
          bankName,
          socialLinks: str("socialLinks"),
          agreementVersion: KOL_AGREEMENT_VERSION,
        },
        files,
      );
      setFlash(
        reply,
        deps.config,
        "success",
        "Đã gửi hồ sơ KOL/KOC. Đội ngũ sẽ duyệt và thông báo kết quả cho bạn.",
      );
      return reply.redirect("/app/dang-ky-kol");
    } catch (error) {
      flashError(reply, deps.config, error);
      return reply.redirect("/app/dang-ky-kol");
    }
  });

  app.get("/profile", async (request, reply) => {
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
    return reply.view("app/profile.njk", {
      pageTitle: "Thông tin cá nhân",
      appSection: "profile",
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
    // Quay lại đúng trang vừa sửa (hồ sơ), không phải trang điều hướng.
    return reply.redirect("/app/profile");
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
