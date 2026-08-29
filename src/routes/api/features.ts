import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import { query } from "../../db.js";
import { parseInput } from "../../lib/validation.js";
import { getCheckinState, recordDailyCheckin } from "../../services/checkin.js";
import {
  claimMissionReward,
  getUnreadNotificationCount,
  getUserMissionOverview,
  listMissionReferralPeople,
  listNotifications,
  markAllNotificationsRead,
} from "../../services/mission.js";
import { getPlatformLeaderboard } from "../../services/platform-stats.js";
import { getBusinessConfig } from "../../services/business-config.js";
import { getInterestedProducts } from "../../services/app-dashboard.js";
import { registerPushToken } from "../../services/push.js";
import { listShopeeVouchers } from "../../services/shopee-voucher.js";
import {
  applyReferralToUser,
  getReferralCodeState,
  requestReferralCodeChange,
} from "../../services/referral-code.js";
import { AppError } from "../../lib/errors.js";
import {
  BEST_SELLER_LIST_TYPE,
  EXCLUSIVE_LIST_TYPE,
  HOT_DEALS_LIST_TYPE,
  RECOMMEND_LIST_TYPE,
  OFFER_PAGE_SIZE,
  getKnownOfferPageCount,
  getStoredOfferPage,
} from "../../services/discover-harvest.js";
import {
  getStoredLazadaOffers,
  getStoredLazadaOffersCount,
} from "../../services/lazada-offer-store.js";
import type { ApiDeps } from "./deps.js";

/**
 * Bốn chức năng mà web đã có nhưng trước đây chỉ tồn tại dưới dạng trang
 * Nunjucks: điểm danh, nhiệm vụ, giới thiệu và khám phá sản phẩm.
 *
 * Vì sao không để app gọi thẳng `/app/*` cho nhanh: nhánh đó dùng `requireUser`,
 * mà guard này CHUYỂN HƯỚNG 302 sang trang đăng nhập khi chưa xác thực chứ
 * không trả 401. App sẽ nhận về HTML thay vì JSON, và cơ chế tự làm mới token
 * khi gặp 401 trong `client.ts` không bao giờ được kích hoạt — người dùng bị đá
 * ra màn đăng nhập dù refresh token còn hạn. Nhánh này dùng `requireApiUser`
 * nên trả đúng 401.
 */
export async function registerFeatureApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  /* ----------------------------- Điểm danh ---------------------------- */

  app.get("/checkin", { preHandler: requireApiUser }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    return getCheckinState(deps.db, request.currentUser!.id);
  });

  app.post("/checkin", { preHandler: requireApiUser }, async (request) => {
    return recordDailyCheckin(deps.db, request.currentUser!.id);
  });

  /* ------------------------------ Nhiệm vụ ---------------------------- */

  app.get("/missions", { preHandler: requireApiUser }, async (request) => {
    return getUserMissionOverview(deps.db, request.currentUser!.id);
  });

  // Danh sách từng người đã mời (để app phân biệt được từng người, khớp web).
  app.get(
    "/missions/referral-people",
    { preHandler: requireApiUser },
    async (request) => {
      const people = await listMissionReferralPeople(
        deps.db,
        request.currentUser!.id,
      );
      return { people };
    },
  );

  app.post("/missions/claim", { preHandler: requireApiUser }, async (request) => {
    const input = parseInput(
      z.object({ missionDefinitionId: z.string().trim().min(1).max(100) }),
      request.body,
    );
    await claimMissionReward(
      deps.db,
      request.currentUser!.id,
      input.missionDefinitionId,
    );
    return { status: "CLAIMED" };
  });

  /* ----------------------------- Giới thiệu --------------------------- */

  app.get("/referrals", { preHandler: requireApiUser }, async (request) => {
    const id = request.currentUser!.id;
    const [nguoiGioiThieu, tongThuong] = await Promise.all([
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
          LIMIT 100
        `,
        [id],
      ),
      query<{ total: string }>(
        deps.db,
        `
          SELECT COALESCE(sum(ce.referral_amount_vnd), 0)::text AS total
          FROM commission_entries ce
          WHERE ce.sharer_user_id = $1 AND ce.status = 'AVAILABLE'
        `,
        [id],
      ),
    ]);

    const me = await query<{
      referral_code: string;
      referred_by_user_id: string | null;
    }>(
      deps.db,
      `SELECT referral_code, referred_by_user_id FROM users WHERE id = $1`,
      [id],
    );
    const codeState = await getReferralCodeState(deps.db, id);

    return {
      // Chưa có người giới thiệu (vd đăng ký Google) → app hiện ô nhập mã.
      hasReferrer: Boolean(me.rows[0]?.referred_by_user_id),
      // Đối tác/KOL: được đổi mã 1 lần (admin duyệt) — app dựa vào đây để hiện form.
      codeState: {
        isPartner: codeState.isPartner,
        customized: Boolean(codeState.customizedAt),
        pendingCode: codeState.pendingCode,
      },
      // PHẢI là `referral_code`, không phải `tracking_code`. Hai cột khác nhau
      // và dùng cho hai việc khác nhau: `tracking_code` đi vào Sub ID để quy kết
      // đơn, còn lúc đăng ký backend tra người giới thiệu bằng
      // `WHERE referral_code = $1` (services/auth.ts). Trả nhầm cột thì mã bạn
      // bè nhập vào không khớp ai cả — người giới thiệu mất thưởng trong im lặng.
      referralCode: me.rows[0]?.referral_code ?? null,
      totalEarnedVnd: Number(tongThuong.rows[0]?.total ?? 0),
      data: nguoiGioiThieu.rows.map((r) => ({
        fullName: r.full_name,
        status: r.status,
        createdAt: r.created_at,
        approvedOrders: Number(r.approved_orders),
        earnedVnd: Number(r.earned_vnd),
      })),
    };
  });

  // Danh sách LINK CHIA SẺ của người dùng (campaign 'sharelink') + tổng hoa hồng
  // chia sẻ đã nhận. Dùng cho tab Chia sẻ trên app.
  app.get("/links", { preHandler: requireApiUser }, async (request) => {
    const id = request.currentUser!.id;
    const [businessConfig, links, shareEarnings] = await Promise.all([
      getBusinessConfig(deps.db, deps.config),
      query<{
        product_name: string | null;
        click_id: string;
        click_count: string;
        orders_count: string;
        created_at: Date;
      }>(
        deps.db,
        `
          SELECT l.product_name, l.click_id, l.click_count::text,
            (SELECT count(*) FROM orders o
              WHERE o.affiliate_link_id = l.id
                AND o.status NOT IN ('INVALID', 'CANCELLED', 'REVERSED'))::text
              AS orders_count,
            l.created_at
          FROM affiliate_links l
          WHERE l.user_id = $1 AND l.campaign = 'sharelink' AND l.status = 'ACTIVE'
          ORDER BY l.created_at DESC
          LIMIT 50
        `,
        [id],
      ),
      query<{ total: string }>(
        deps.db,
        `
          SELECT COALESCE(sum(ce.referral_amount_vnd), 0)::text AS total
          FROM commission_entries ce
          WHERE ce.sharer_user_id = $1 AND ce.status = 'AVAILABLE'
        `,
        [id],
      ),
    ]);
    const origin = deps.config.APP_ORIGIN.replace(/\/+$/, "");
    return {
      enabled: businessConfig.enableShareLink,
      sharerSharePercent: businessConfig.referrerSharePercent,
      totalEarnedVnd: Number(shareEarnings.rows[0]?.total ?? 0),
      links: links.rows.map((l) => ({
        productName: l.product_name,
        shareUrl: `${origin}/go/${l.click_id}`,
        clickCount: Number(l.click_count),
        ordersCount: Number(l.orders_count),
        createdAt: l.created_at,
      })),
    };
  });

  // Tài khoản chưa có người giới thiệu (vd đăng ký Google) nhập mã sau khi vào app.
  app.post("/referrals/enter-code", { preHandler: requireApiUser }, async (request) => {
    const input = parseInput(
      z.object({ referralCode: z.string().trim().min(1).max(20) }),
      request.body,
    );
    const ok = await applyReferralToUser(
      deps.db,
      request.currentUser!.id,
      input.referralCode,
    );
    if (!ok) {
      throw new AppError(
        "REFERRAL_CODE_NOT_FOUND",
        "Mã giới thiệu không tồn tại hoặc không dùng được. Kiểm tra lại nhé.",
        400,
      );
    }
    return { status: "APPLIED" };
  });

  // Đối tác/KOL gửi yêu cầu đổi mã giới thiệu (admin duyệt mới hiệu lực).
  app.post("/referrals/code-change", { preHandler: requireApiUser }, async (request) => {
    const input = parseInput(
      z.object({ newCode: z.string().trim().min(1).max(20) }),
      request.body,
    );
    await requestReferralCodeChange(
      deps.db,
      request.currentUser!.id,
      input.newCode,
    );
    return { status: "PENDING" };
  });

  /* --------------------- Sản phẩm bạn quan tâm ------------------------ */

  // Sản phẩm đã bấm Mua ngay nhưng chưa thành đơn (instantbuy), của riêng user.
  app.get("/interested", { preHandler: requireApiUser }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const data = await getInterestedProducts(deps.db, request.currentUser!.id);
    return { data };
  });

  /* ---------------------------- Thông báo ----------------------------- */

  app.get("/notifications", { preHandler: requireApiUser }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const uid = request.currentUser!.id;
    const [unread, items] = await Promise.all([
      getUnreadNotificationCount(deps.db, uid),
      listNotifications(deps.db, uid, 40),
    ]);
    return { unread, items };
  });

  app.post(
    "/notifications/mark-read",
    { preHandler: requireApiUser },
    async (request, reply) => {
      await markAllNotificationsRead(deps.db, request.currentUser!.id);
      return reply.code(204).send();
    },
  );

  // Đăng ký token đẩy của thiết bị để nhận thông báo ngoài app.
  app.post("/push/register", { preHandler: requireApiUser }, async (request, reply) => {
    const input = parseInput(
      z.object({ token: z.string().trim().min(10).max(255) }),
      request.body,
    );
    await registerPushToken(deps.db, request.currentUser!.id, input.token);
    return reply.code(204).send();
  });

  /* --------------------------- Bảng xếp hạng -------------------------- */

  // Công khai như web: bảng xếp hạng hiện cả khi chưa đăng nhập.
  app.get("/leaderboard", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return getPlatformLeaderboard(deps.db);
  });

  /* ------------------------------ Khám phá ---------------------------- */

  // Mở cho khách: xem sản phẩm đang hoàn tiền không cần tài khoản, giống web.
  // Voucher Shopee hôm nay (công khai) — cho tab Voucher ở Khám phá.
  app.get("/vouchers", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return { data: await listShopeeVouchers(deps.db, 300) };
  });

  app.get("/discover", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const q = request.query as Record<string, unknown>;
    // Cùng bảng ánh xạ tên danh mục → list_type Shopee mà web dùng.
    const DANH_MUC: Record<string, number> = {
      recommend: RECOMMEND_LIST_TYPE,
      best: BEST_SELLER_LIST_TYPE,
      exclusive: EXCLUSIVE_LIST_TYPE,
      hot: HOT_DEALS_LIST_TYPE,
    };
    const ten = String(q.list ?? "best");
    const listType = DANH_MUC[ten] ?? BEST_SELLER_LIST_TYPE;
    const parsed = Number.parseInt(String(q.page ?? "1"), 10);
    const page = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 1, 1), 100);

    const [rows, knownPages] = await Promise.all([
      getStoredOfferPage(deps.db, listType, page),
      getKnownOfferPageCount(deps.db, listType),
    ]);
    return { list: ten, page, knownPages, data: rows };
  });

  // Sản phẩm affiliate LAZADA cho app (menu con Lazada của Khám phá). Đọc từ
  // kho lazada_offer_products; cùng shape DiscoverProduct với /discover.
  app.get("/discover/lazada", async (request, reply) => {
    reply.header("cache-control", "public, max-age=120");
    const q = request.query as Record<string, unknown>;
    const list = String(q.list ?? "recommend");
    const parsed = Number.parseInt(String(q.page ?? "1"), 10);
    const page = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 1, 1), 100);

    const [rows, total] = await Promise.all([
      getStoredLazadaOffers(deps.db, { list, page, pageSize: OFFER_PAGE_SIZE }),
      getStoredLazadaOffersCount(deps.db),
    ]);
    return {
      list,
      page,
      knownPages: Math.max(1, Math.ceil(total / OFFER_PAGE_SIZE)),
      data: rows.map((r) => ({
        item_id: r.item_id,
        name: r.name,
        image_url: r.image_url,
        price_vnd: r.price_vnd,
        commission_rate_bps: r.commission_rate_bps,
        shop_name: r.shop_name,
        product_url: r.product_url,
        sales_count: r.sales_count !== null ? String(r.sales_count) : null,
        original_price_vnd: null,
        discount_percent: null,
      })),
    };
  });
}
