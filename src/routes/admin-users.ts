import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query } from "../db.js";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { formatVnd } from "../lib/format.js";
import {
  buildBarList,
  buildSeriesLineChart,
} from "../services/chart-data.js";
import { passwordSchema } from "../lib/password.js";
import { parseInput } from "../lib/validation.js";
import { writeAuditLog } from "../services/audit.js";
import { registerWithEmail } from "../services/auth.js";
import { getWalletBalances } from "../services/ledger.js";
import {
  decideReferralCodeRequest,
  listReferralCodeRequests,
} from "../services/referral-code.js";
import {
  flashAdminError,
  pageNumber,
  selectedValue,
  STAFF_ROLES,
  USER_STATUSES,
  type AdminConsoleDeps,
} from "./admin-console-shared.js";

function monthKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

export async function registerAdminUserRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/accounts", async (request, reply) => {
    const params = request.query as Record<string, unknown>;
    const q = String(params.q ?? "").trim().slice(0, 120);
    const role = selectedValue(
      ["ALL", ...STAFF_ROLES, "SUPER_ADMIN"] as const,
      params.role,
      "ALL",
    );
    const status = selectedValue(USER_STATUSES, params.status, "ALL");
    // Lọc nhanh đối tác/KOL để phân biệt với khách thường ngay trên danh sách.
    const partner = selectedValue(
      ["ALL", "PARTNER", "NORMAL"] as const,
      params.partner,
      "ALL",
    );
    const page = pageNumber(params.page);
    const limit = 30;
    const offset = (page - 1) * limit;
    const users = await query<{
      id: string;
      email: string;
      full_name: string;
      status: string;
      role: string;
      referral_code: string;
      is_special_partner: boolean;
      created_at: Date;
      referred_by_name: string | null;
      referred_count: string;
      referred_rewarded_count: string;
      pending_vnd: string;
      available_vnd: string;
      paid_vnd: string;
      links_count: string;
      clicks_count: string;
      orders_count: string;
      verified_orders_count: string;
      manual_orders_count: string;
      order_value_vnd: string;
      cashback_vnd: string;
      last_login_at: Date | null;
      deleted_at: Date | null;
      total_count: string;
    }>(
      deps.db,
      `
        SELECT
          u.id, u.email, u.full_name, u.status, u.role, u.referral_code, u.is_special_partner,
          u.created_at,
          referrer.full_name AS referred_by_name,
          (SELECT count(*) FROM referrals r
            WHERE r.referrer_user_id = u.id)::text AS referred_count,
          (SELECT count(*) FROM referrals r
            WHERE r.referrer_user_id = u.id AND r.status = 'REWARDED')::text
            AS referred_rewarded_count,
          COALESCE((
            SELECT sum(CASE WHEN e.direction = 'CREDIT'
              THEN e.amount_vnd ELSE -e.amount_vnd END)
            FROM ledger_accounts a
            JOIN ledger_entries e ON e.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = u.id
              AND a.code = 'PENDING'
          ), 0)::text AS pending_vnd,
          COALESCE((
            SELECT sum(CASE WHEN e.direction = 'CREDIT'
              THEN e.amount_vnd ELSE -e.amount_vnd END)
            FROM ledger_accounts a
            JOIN ledger_entries e ON e.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = u.id
              AND a.code = 'AVAILABLE'
          ), 0)::text AS available_vnd,
          COALESCE((
            SELECT sum(CASE WHEN e.direction = 'CREDIT'
              THEN e.amount_vnd ELSE -e.amount_vnd END)
            FROM ledger_accounts a
            JOIN ledger_entries e ON e.account_id = a.id
            WHERE a.owner_type = 'USER' AND a.owner_id = u.id
              AND a.code = 'PAID'
          ), 0)::text AS paid_vnd,
          (SELECT count(*) FROM affiliate_links l
            WHERE l.user_id = u.id)::text AS links_count,
          COALESCE((SELECT sum(l.click_count) FROM affiliate_links l
            WHERE l.user_id = u.id), 0)::text AS clicks_count,
          (SELECT count(*) FROM orders o
            WHERE o.user_id = u.id)::text AS orders_count,
          (SELECT count(*) FROM orders o
            WHERE o.user_id = u.id
              AND o.evidence_status = 'VERIFIED')::text
            AS verified_orders_count,
          (SELECT count(*) FROM orders o
            WHERE o.user_id = u.id
              AND o.evidence_status = 'MANUAL_REVIEW')::text
            AS manual_orders_count,
          COALESCE((SELECT sum(o.order_amount_vnd) FROM orders o
            WHERE o.user_id = u.id
              AND o.evidence_status = 'VERIFIED'
              AND o.status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')), 0)::text
            AS order_value_vnd,
          COALESCE((SELECT sum(o.cashback_vnd) FROM orders o
            WHERE o.user_id = u.id AND o.status = 'APPROVED'
              AND o.evidence_status = 'VERIFIED'), 0)::text
            AS cashback_vnd,
          u.last_login_at, u.deleted_at, count(*) OVER()::text AS total_count
        FROM users u
        LEFT JOIN users referrer ON referrer.id = u.referred_by_user_id
        WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%'
          OR u.full_name ILIKE '%' || $1 || '%'
          OR u.referral_code ILIKE '%' || $1 || '%')
          AND ($2 = 'ALL' OR u.role = $2)
          AND ($3 = 'ALL' OR u.status = $3)
          AND ($6 = 'ALL'
            OR ($6 = 'PARTNER' AND u.is_special_partner)
            OR ($6 = 'NORMAL' AND NOT u.is_special_partner))
        ORDER BY
          CASE u.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING_EMAIL' THEN 1
            WHEN 'LOCKED' THEN 2 ELSE 3 END,
          u.created_at DESC
        LIMIT $4 OFFSET $5
      `,
      [q, role, status, limit, offset, partner],
    );
    const total = Number(users.rows[0]?.total_count ?? 0);
    const refRequests = await listReferralCodeRequests(deps.db);
    return reply.view("backoffice/accounts-list-v2.njk", {
      pageTitle: "Người dùng",
      backofficeSection: "users",
      refRequests,
      users: users.rows,
      filters: { q, role, status, partner },
      pagination: {
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        total,
      },
    });
  });

  app.post("/accounts", async (request, reply) => {
    if (request.currentUser!.role !== "SUPER_ADMIN") {
      throw new AppError(
        "FORBIDDEN",
        "Chỉ quản trị cao nhất mới được thêm tài khoản.",
        403,
      );
    }
    try {
      const input = parseInput(
        z
          .object({
            fullName: z
              .string()
              .trim()
              .min(2, "Họ và tên cần ít nhất 2 ký tự.")
              .max(100, "Họ và tên quá dài."),
            email: z.string().trim().email("Email không hợp lệ."),
            password: passwordSchema,
            passwordConfirm: z.string(),
            role: z.enum(
              ["USER", "SUPPORT", "FINANCE", "RISK", "AUDITOR"],
              { message: "Vui lòng chọn một quyền hợp lệ." },
            ),
          })
          .refine((value) => value.password === value.passwordConfirm, {
            message: "Mật khẩu xác nhận chưa khớp.",
            path: ["passwordConfirm"],
          }),
        request.body,
      );
      await registerWithEmail(
        deps.db,
        deps.emailService,
        deps.config,
        {
          email: input.email,
          fullName: input.fullName,
          password: input.password,
        },
      );
      const created = await query<{ id: string }>(
        deps.db,
        `
          UPDATE users SET role = $2
          WHERE lower(email) = lower($1)
          RETURNING id
        `,
        [input.email, input.role],
      );
      const createdUser = created.rows[0];
      if (!createdUser) {
        throw new AppError(
          "USER_CREATE_FAILED",
          "Không thể hoàn tất việc tạo tài khoản.",
        );
      }
      await writeAuditLog(deps.db, deps.config, request, {
        action: "USER_CREATED_BY_ADMIN",
        targetType: "USER",
        targetId: createdUser.id,
        after: { email: input.email.toLowerCase(), role: input.role },
      });
      setFlash(
        reply,
        deps.config,
        "success",
        "Đã tạo tài khoản và gửi mã xác nhận email cho người dùng.",
      );
      return reply.redirect("/backoffice/accounts");
    } catch (error) {
      flashAdminError(reply, deps.config, error);
      return reply.redirect("/backoffice/accounts?open=create-user-modal");
    }
  });

  app.get<{ Params: { id: string } }>(
    "/accounts/:id",
    async (request, reply) => {
      const [
        user,
        balances,
        orders,
        links,
        referrals,
        logs,
        orderMonthly,
        topProducts,
        clickedProducts,
        hourBuckets,
      ] = await Promise.all([
          query<{
            id: string;
            email: string;
            full_name: string;
            status: string;
            role: string;
            referral_code: string;
            is_special_partner: boolean;
            referred_by_name: string | null;
            referred_by_email: string | null;
            created_at: Date;
            last_login_at: Date | null;
            email_verified_at: Date | null;
            deleted_at: Date | null;
            deletion_reason: string | null;
            referrals_count: string;
            referrals_with_orders: string;
            orders_count: string;
            verified_orders_count: string;
            manual_orders_count: string;
            order_value_vnd: string;
            cashback_vnd: string;
            links_count: string;
            clicks_count: string;
            linked_orders: string;
            sharer_reward_vnd: string;
          }>(
            deps.db,
            `
              SELECT u.id, u.email, u.full_name, u.status, u.role,
                u.referral_code, u.is_special_partner,
                referrer.full_name AS referred_by_name,
                referrer.email AS referred_by_email, u.created_at,
                u.last_login_at, u.email_verified_at, u.deleted_at,
                u.deletion_reason,
                (SELECT count(*) FROM referrals r
                  WHERE r.referrer_user_id = u.id)::text AS referrals_count,
                (SELECT count(DISTINCT r.referred_user_id)
                  FROM referrals r
                  WHERE r.referrer_user_id = u.id
                    AND EXISTS (SELECT 1 FROM orders ro
                      WHERE ro.user_id = r.referred_user_id
                        AND ro.status = 'APPROVED'))::text
                  AS referrals_with_orders,
                (SELECT count(*) FROM orders o
                  WHERE o.user_id = u.id)::text AS orders_count,
                (SELECT count(*) FROM orders o
                  WHERE o.user_id = u.id
                    AND o.evidence_status = 'VERIFIED')::text
                  AS verified_orders_count,
                (SELECT count(*) FROM orders o
                  WHERE o.user_id = u.id
                    AND o.evidence_status = 'MANUAL_REVIEW')::text
                  AS manual_orders_count,
                COALESCE((SELECT sum(o.order_amount_vnd) FROM orders o
                  WHERE o.user_id = u.id
                    AND o.evidence_status = 'VERIFIED'
                    AND o.status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')), 0)::text
                  AS order_value_vnd,
                COALESCE((SELECT sum(o.cashback_vnd) FROM orders o
                  WHERE o.user_id = u.id AND o.status = 'APPROVED'
                    AND o.evidence_status = 'VERIFIED'), 0)::text
                  AS cashback_vnd,
                (SELECT count(*) FROM affiliate_links l
                  WHERE l.user_id = u.id)::text AS links_count,
                COALESCE((SELECT sum(l.click_count) FROM affiliate_links l
                  WHERE l.user_id = u.id), 0)::text AS clicks_count,
                (SELECT count(*) FROM commission_entries ce
                  WHERE ce.sharer_user_id = u.id
                    AND ce.status <> 'REVERSED')::text AS linked_orders,
                COALESCE((SELECT sum(ce.referral_amount_vnd)
                  FROM commission_entries ce
                  WHERE ce.sharer_user_id = u.id
                    AND ce.status = 'AVAILABLE'), 0)::text AS sharer_reward_vnd
              FROM users u
              LEFT JOIN users referrer ON referrer.id = u.referred_by_user_id
              WHERE u.id = $1
            `,
            [request.params.id],
          ),
          getWalletBalances(deps.db, request.params.id),
          query<{
            id: string;
            platform: string;
            platform_order_id: string;
            status: string;
            order_amount_vnd: string;
            commission_vnd: string;
            cashback_vnd: string;
            purchased_at: Date | null;
            created_at: Date;
            evidence_status: string;
            evidence_verified_at: Date | null;
            attribution_method: string | null;
            attribution_value: string | null;
            attributed_at: Date | null;
            affiliate_id: string | null;
            click_id: string | null;
            sub_id: string | null;
            link_created_at: Date | null;
            clicked_product_name: string | null;
            actual_product_name: string | null;
            item_source: string | null;
            first_click_at: Date | null;
            last_click_at: Date | null;
            valid_click_count: string;
            raw_source: string | null;
            raw_checksum: string | null;
            raw_received_at: Date | null;
            raw_processed_at: Date | null;
          }>(
            deps.db,
            `
              SELECT o.id, o.platform, o.platform_order_id, o.status,
                o.order_amount_vnd::text, o.commission_vnd::text,
                o.cashback_vnd::text, o.purchased_at, o.created_at,
                o.evidence_status, o.evidence_verified_at,
                o.attribution_method, o.attribution_value, o.attributed_at,
                p.affiliate_id, l.click_id, l.sub_id,
                l.created_at AS link_created_at,
                l.product_name AS clicked_product_name,
                oi.item_name AS actual_product_name, oi.source AS item_source,
                clicks.first_click_at, clicks.last_click_at,
                COALESCE(clicks.valid_click_count, 0)::text AS valid_click_count,
                raw.source AS raw_source, raw.checksum AS raw_checksum,
                raw.received_at AS raw_received_at,
                raw.processed_at AS raw_processed_at
              FROM orders o
              LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
              LEFT JOIN affiliate_programs p ON p.id = l.program_id
              LEFT JOIN conversion_raw raw ON raw.id = o.raw_conversion_id
              LEFT JOIN LATERAL (
                SELECT item_name, source
                FROM order_items
                WHERE order_id = o.id
                ORDER BY CASE source WHEN 'REPORT' THEN 0 ELSE 1 END, id
                LIMIT 1
              ) oi ON true
              LEFT JOIN LATERAL (
                SELECT min(occurred_at) FILTER (WHERE bot_flag = false) AS first_click_at,
                  max(occurred_at) FILTER (WHERE bot_flag = false) AS last_click_at,
                  count(*) FILTER (WHERE bot_flag = false) AS valid_click_count
                FROM click_events
                WHERE affiliate_link_id = l.id
              ) clicks ON true
              WHERE o.user_id = $1
              ORDER BY o.created_at DESC LIMIT 10
            `,
            [request.params.id],
          ),
          query<{
            click_id: string;
            normalized_url: string;
            click_count: string;
            status: string;
            created_at: Date;
          }>(
            deps.db,
            `
              SELECT click_id, normalized_url, click_count::text, status,
                created_at
              FROM affiliate_links WHERE user_id = $1
              ORDER BY created_at DESC LIMIT 10
            `,
            [request.params.id],
          ),
          query<{
            id: string;
            full_name: string;
            email: string;
            status: string;
            created_at: Date;
            approved_orders: string;
            earned_vnd: string;
          }>(
            deps.db,
            `
              SELECT u.id, u.full_name, u.email, r.status, r.created_at,
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
              ORDER BY COALESCE((SELECT sum(ce2.referral_amount_vnd)
                  FROM commission_entries ce2
                  JOIN orders o3 ON o3.id = ce2.order_id
                  WHERE ce2.sharer_user_id = $1 AND o3.user_id = u.id
                    AND ce2.status = 'AVAILABLE'), 0) DESC,
                r.created_at DESC
              LIMIT 20
            `,
            [request.params.id],
          ),
          query<{
            action: string;
            actor_email: string | null;
            reason: string | null;
            created_at: Date;
          }>(
            deps.db,
            `
              SELECT a.action, actor.email AS actor_email, a.reason,
                a.created_at
              FROM audit_logs a
              LEFT JOIN users actor ON actor.id = a.actor_user_id
              WHERE a.target_type = 'USER' AND a.target_id = $1
              ORDER BY a.created_at DESC LIMIT 12
            `,
            [request.params.id],
          ),
          query<{ month: Date; orders_count: string; amount_vnd: string }>(
            deps.db,
            `
              SELECT date_trunc('month', COALESCE(purchased_at, created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh') AS month,
                count(*)::text AS orders_count,
                COALESCE(sum(order_amount_vnd), 0)::text AS amount_vnd
              FROM orders
              WHERE user_id = $1
                AND evidence_status = 'VERIFIED'
                AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')
                AND COALESCE(purchased_at, created_at) >
                  date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - interval '11 months'
              GROUP BY 1 ORDER BY 1
            `,
            [request.params.id],
          ),
          // Mua những gì — theo dữ liệu đơn chính thức từ sàn.
          query<{ item_name: string; times: string; amount_vnd: string }>(
            deps.db,
            `
              SELECT oi.item_name, count(*)::text AS times,
                COALESCE(sum(oi.amount_vnd), 0)::text AS amount_vnd
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE o.user_id = $1
                AND o.evidence_status = 'VERIFIED'
                AND o.status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')
              GROUP BY oi.item_name
              ORDER BY count(*) DESC, sum(oi.amount_vnd) DESC
              LIMIT 8
            `,
            [request.params.id],
          ),
          // Sản phẩm đã bấm Mua ngay (trước khi sàn gửi dữ liệu đơn).
          query<{ product_name: string; times: string }>(
            deps.db,
            `
              SELECT COALESCE(product_name, 'Sản phẩm chưa rõ tên') AS product_name,
                count(*)::text AS times
              FROM affiliate_links
              WHERE user_id = $1
              GROUP BY 1 ORDER BY count(*) DESC
              LIMIT 8
            `,
            [request.params.id],
          ),
          // Khung giờ hay mua trong ngày.
          query<{ bucket: string; times: string }>(
            deps.db,
            `
              SELECT CASE
                  WHEN h BETWEEN 5 AND 10 THEN 'Sáng (5–11h)'
                  WHEN h BETWEEN 11 AND 13 THEN 'Trưa (11–14h)'
                  WHEN h BETWEEN 14 AND 17 THEN 'Chiều (14–18h)'
                  WHEN h BETWEEN 18 AND 22 THEN 'Tối (18–23h)'
                  ELSE 'Đêm (23–5h)'
                END AS bucket,
                count(*)::text AS times
              FROM (
                SELECT EXTRACT(HOUR FROM COALESCE(purchased_at, created_at)
                  AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS h
                FROM orders
                WHERE user_id = $1
                  AND evidence_status = 'VERIFIED'
                  AND status NOT IN ('INVALID', 'CANCELLED', 'REVERSED')
              ) hours
              GROUP BY 1 ORDER BY count(*) DESC
            `,
            [request.params.id],
          ),
        ]);
      if (!user.rows[0]) {
        throw new AppError("USER_NOT_FOUND", "Không tìm thấy người dùng.", 404);
      }
      const monthly = new Map(
        orderMonthly.rows.map((row) => [
          monthKey(row.month),
          {
            orders: Number(row.orders_count),
            amount: Number(row.amount_vnd),
          },
        ]),
      );
      const purchasePoints = [];
      for (let back = 11; back >= 0; back -= 1) {
        const date = new Date();
        date.setDate(1);
        date.setMonth(date.getMonth() - back);
        const label = monthKey(date);
        const bucket = monthly.get(label) ?? { orders: 0, amount: 0 };
        purchasePoints.push({
          label,
          value: bucket.orders,
          tooltip: `${bucket.orders} đơn · ${formatVnd(bucket.amount)}`,
        });
      }

      const peak = purchasePoints.reduce(
        (best, point) => (point.value > best.value ? point : best),
        { label: "", value: 0, tooltip: "" },
      );

      return reply.view("backoffice/account-detail-v2.njk", {
        pageTitle: user.rows[0].full_name,
        backofficeSection: "users",
        user: user.rows[0],
        balances,
        orders: orders.rows,
        links: links.rows,
        referrals: referrals.rows,
        logs: logs.rows,
        purchaseChart: buildSeriesLineChart(
          purchasePoints,
          (value) => `${value} đơn`,
        ),
        peakMonth: peak.value > 0 ? peak : null,
        topProductsBar: buildBarList(
          topProducts.rows.map((row) => ({
            label: row.item_name,
            value: Number(row.times),
          })),
        ).map((item, index) => ({
          ...item,
          valueLabel: `${topProducts.rows[index]!.times} lần · ${formatVnd(
            Number(topProducts.rows[index]!.amount_vnd),
          )}`,
        })),
        clickedProductsBar: buildBarList(
          clickedProducts.rows.map((row) => ({
            label: row.product_name,
            value: Number(row.times),
          })),
          (value) => `${value} lần bấm mua`,
        ),
        hourBucketsBar: buildBarList(
          hourBuckets.rows.map((row) => ({
            label: row.bucket,
            value: Number(row.times),
          })),
          (value) => `${value} đơn`,
        ),
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/accounts/:id/status",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN", "RISK"].includes(request.currentUser!.role)) {
        throw new AppError(
          "FORBIDDEN",
          "Bạn không có quyền khóa hoặc mở tài khoản.",
          403,
        );
      }
      try {
        const input = parseInput(
          z.object({
            status: z.enum(["ACTIVE", "LOCKED"], {
              message: "Trạng thái không hợp lệ.",
            }),
            reason: z
              .string()
              .trim()
              .max(500, "Lý do quá dài, tối đa 500 ký tự.")
              .optional()
              .default(""),
          }),
          request.body,
        );
        if (input.status === "LOCKED" && input.reason.length < 5) {
          throw new AppError(
            "REASON_REQUIRED",
            "Hãy nhập lý do khóa tài khoản, ít nhất 5 ký tự.",
          );
        }
        if (request.params.id === request.currentUser!.id) {
          throw new AppError(
            "FORBIDDEN",
            "Bạn không thể tự khóa tài khoản đang đăng nhập.",
          );
        }
        const target = await query<{ role: string; status: string }>(
          deps.db,
          "SELECT role, status FROM users WHERE id = $1",
          [request.params.id],
        );
        const row = target.rows[0];
        if (!row) {
          throw new AppError("USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }
        if (!["ACTIVE", "LOCKED"].includes(row.status)) {
          throw new AppError(
            "INVALID_ACCOUNT_TRANSITION",
            "Chỉ tài khoản đang hoạt động hoặc đã khóa mới được đổi trạng thái.",
          );
        }
        if (row.role === "SUPER_ADMIN") {
          throw new AppError(
            "FORBIDDEN",
            "Không thể khóa tài khoản quản trị cao nhất.",
            403,
          );
        }
        if (
          row.role === "ADMIN" &&
          request.currentUser!.role !== "SUPER_ADMIN"
        ) {
          throw new AppError(
            "FORBIDDEN",
            "Chỉ quản trị cao nhất mới được khóa quản trị viên.",
            403,
          );
        }
        if (request.currentUser!.role === "RISK" && row.role !== "USER") {
          throw new AppError(
            "FORBIDDEN",
            "Vai trò kiểm soát chỉ được khóa tài khoản người dùng.",
            403,
          );
        }
        await query(
          deps.db,
          "UPDATE users SET status = $2 WHERE id = $1 AND deleted_at IS NULL",
          [request.params.id, input.status],
        );
        if (input.status === "LOCKED") {
          await query(
            deps.db,
            `
              UPDATE sessions SET revoked_at = now()
              WHERE user_id = $1 AND revoked_at IS NULL
            `,
            [request.params.id],
          );
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: `USER_${input.status}`,
          targetType: "USER",
          targetId: request.params.id,
          reason: input.reason,
          before: { status: row.status },
          after: { status: input.status },
        });
        setFlash(
          reply,
          deps.config,
          "success",
          "Đã cập nhật trạng thái tài khoản.",
        );
      } catch (error) {
        flashAdminError(reply, deps.config, error);
      }
      return reply.redirect(`/backoffice/accounts/${request.params.id}`);
    },
  );

  // Bật/tắt ĐỐI TÁC ĐẶC BIỆT: đơn của người họ giới thiệu chia
  // specialPartnerSharePercent% (thay vì referrerSharePercent%).
  // Duyệt/từ chối yêu cầu đổi mã giới thiệu của đối tác/KOL.
  app.post<{ Params: { id: string } }>(
    "/referral-codes/:id/decide",
    async (request, reply) => {
      try {
        const approve =
          (request.body as Record<string, unknown>).decision === "approve";
        const decided = await decideReferralCodeRequest(
          deps.db,
          request.params.id,
          approve,
          request.currentUser!.id,
        );
        await writeAuditLog(deps.db, deps.config, request, {
          action: approve
            ? "REFERRAL_CODE_APPROVED"
            : "REFERRAL_CODE_REJECTED",
          targetType: "USER",
          targetId: decided.user_id,
          after: {
            old_code: decided.old_code,
            requested_code: decided.requested_code,
          },
        });
        setFlash(
          reply,
          deps.config,
          "success",
          approve
            ? `Đã duyệt mã "${decided.requested_code}" — đối tác đã nhận thông báo.`
            : `Đã từ chối mã "${decided.requested_code}".`,
        );
      } catch (error) {
        flashAdminError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/accounts");
    },
  );

  app.post<{ Params: { id: string } }>(
    "/accounts/:id/special-partner",
    async (request, reply) => {
      try {
        const batDacBiet =
          (request.body as Record<string, unknown>).value === "1";
        const updated = await query<{ is_special_partner: boolean }>(
          deps.db,
          `UPDATE users SET is_special_partner = $2
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING is_special_partner`,
          [request.params.id, batDacBiet],
        );
        if (!updated.rows[0]) {
          throw new AppError("USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: batDacBiet
            ? "USER_SPECIAL_PARTNER_ON"
            : "USER_SPECIAL_PARTNER_OFF",
          targetType: "USER",
          targetId: request.params.id,
          after: { is_special_partner: batDacBiet },
        });
        setFlash(
          reply,
          deps.config,
          "success",
          batDacBiet
            ? "Đã đặt làm đối tác đặc biệt."
            : "Đã bỏ đối tác đặc biệt.",
        );
      } catch (error) {
        flashAdminError(reply, deps.config, error);
      }
      // Gọi từ bảng danh sách (next=list) thì quay về đúng danh sách đang lọc.
      const next = (request.body as Record<string, unknown>).next;
      if (next === "list") return reply.redirect("/backoffice/accounts");
      return reply.redirect(`/backoffice/accounts/${request.params.id}`);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/accounts/:id/role",
    async (request, reply) => {
      if (request.currentUser!.role !== "SUPER_ADMIN") {
        throw new AppError(
          "FORBIDDEN",
          "Chỉ quản trị cao nhất mới được đổi quyền.",
          403,
        );
      }
      try {
        const input = parseInput(
          z.object({
            role: z.enum(
              ["USER", "SUPPORT", "FINANCE", "RISK", "AUDITOR", "ADMIN"],
              { message: "Vui lòng chọn một quyền hợp lệ." },
            ),
            reason: z
              .string()
              .trim()
              .min(5, "Hãy nhập lý do thay đổi quyền, ít nhất 5 ký tự.")
              .max(500, "Lý do quá dài, tối đa 500 ký tự."),
          }),
          request.body,
        );
        if (request.params.id === request.currentUser!.id) {
          throw new AppError(
            "FORBIDDEN",
            "Không thể tự đổi quyền của chính mình.",
          );
        }
        const target = await query<{ role: string }>(
          deps.db,
          "SELECT role FROM users WHERE id = $1",
          [request.params.id],
        );
        const row = target.rows[0];
        if (!row) {
          throw new AppError("USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }
        if (row.role === "SUPER_ADMIN") {
          throw new AppError(
            "FORBIDDEN",
            "Không thể đổi quyền quản trị cao nhất.",
            403,
          );
        }
        await query(deps.db, "UPDATE users SET role = $2 WHERE id = $1", [
          request.params.id,
          input.role,
        ]);
        await query(
          deps.db,
          `
            UPDATE sessions SET revoked_at = now()
            WHERE user_id = $1 AND revoked_at IS NULL
          `,
          [request.params.id],
        );
        await writeAuditLog(deps.db, deps.config, request, {
          action: "USER_ROLE_CHANGED",
          targetType: "USER",
          targetId: request.params.id,
          reason: input.reason,
          before: { role: row.role },
          after: { role: input.role },
        });
        setFlash(
          reply,
          deps.config,
          "success",
          "Đã cập nhật quyền và ghi nhật ký thay đổi.",
        );
      } catch (error) {
        flashAdminError(reply, deps.config, error);
      }
      return reply.redirect(`/backoffice/accounts/${request.params.id}`);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/accounts/:id/delete",
    async (request, reply) => {
      if (request.currentUser!.role !== "SUPER_ADMIN") {
        throw new AppError(
          "FORBIDDEN",
          "Chỉ quản trị cao nhất mới được xóa tài khoản.",
          403,
        );
      }
      try {
        const input = parseInput(
          z.object({
            reason: z
              .string()
              .trim()
              .min(10, "Hãy nhập lý do xóa tài khoản, ít nhất 10 ký tự.")
              .max(500, "Lý do quá dài, tối đa 500 ký tự."),
          }),
          request.body,
        );
        if (request.params.id === request.currentUser!.id) {
          throw new AppError(
            "FORBIDDEN",
            "Không thể xóa tài khoản đang đăng nhập.",
          );
        }
        const target = await query<{ role: string; status: string }>(
          deps.db,
          "SELECT role, status FROM users WHERE id = $1",
          [request.params.id],
        );
        const row = target.rows[0];
        if (!row) {
          throw new AppError("USER_NOT_FOUND", "Không tìm thấy người dùng.");
        }
        if (row.role === "SUPER_ADMIN") {
          throw new AppError(
            "FORBIDDEN",
            "Không thể xóa tài khoản quản trị cao nhất.",
            403,
          );
        }
        const updated = await query(
          deps.db,
          `
            UPDATE users
            SET status = 'DISABLED', role = 'USER', deleted_at = now(),
              deleted_by = $2, deletion_reason = $3
            WHERE id = $1 AND deleted_at IS NULL
          `,
          [request.params.id, request.currentUser!.id, input.reason],
        );
        if (!updated.rowCount) {
          throw new AppError(
            "USER_ALREADY_DELETED",
            "Tài khoản đã được xóa trước đó.",
          );
        }
        await query(
          deps.db,
          `
            UPDATE sessions SET revoked_at = now()
            WHERE user_id = $1 AND revoked_at IS NULL
          `,
          [request.params.id],
        );
        await writeAuditLog(deps.db, deps.config, request, {
          action: "USER_DELETED",
          targetType: "USER",
          targetId: request.params.id,
          reason: input.reason,
          before: { status: row.status, role: row.role },
          after: { status: "DISABLED", role: "USER" },
        });
        setFlash(
          reply,
          deps.config,
          "success",
          "Đã xóa quyền truy cập. Dữ liệu đơn và tiền vẫn được giữ để đối soát.",
        );
      } catch (error) {
        flashAdminError(reply, deps.config, error);
        return reply.redirect(`/backoffice/accounts/${request.params.id}`);
      }
      return reply.redirect("/backoffice/accounts?status=DISABLED");
    },
  );
}
