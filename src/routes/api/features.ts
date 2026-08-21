import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import { query } from "../../db.js";
import { parseInput } from "../../lib/validation.js";
import { getCheckinState, recordDailyCheckin } from "../../services/checkin.js";
import {
  claimMissionReward,
  getUserMissionOverview,
} from "../../services/mission.js";
import {
  BEST_SELLER_LIST_TYPE,
  EXCLUSIVE_LIST_TYPE,
  RECOMMEND_LIST_TYPE,
  getKnownOfferPageCount,
  getStoredOfferPage,
} from "../../services/discover-harvest.js";
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

    const me = await query<{ referral_code: string }>(
      deps.db,
      `SELECT referral_code FROM users WHERE id = $1`,
      [id],
    );

    return {
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

  /* ------------------------------ Khám phá ---------------------------- */

  // Mở cho khách: xem sản phẩm đang hoàn tiền không cần tài khoản, giống web.
  app.get("/discover", async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const q = request.query as Record<string, unknown>;
    // Cùng bảng ánh xạ tên danh mục → list_type Shopee mà web dùng.
    const DANH_MUC: Record<string, number> = {
      recommend: RECOMMEND_LIST_TYPE,
      best: BEST_SELLER_LIST_TYPE,
      exclusive: EXCLUSIVE_LIST_TYPE,
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
}
