import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { formatVnd } from "../lib/format.js";
import {
  buildMonthlyBarChart,
  buildMonthlySeries,
} from "../services/chart-data.js";
import type { AdminConsoleDeps } from "./admin-console-shared.js";

/**
 * Trang Thống kê cho admin:
 *  1. Sản phẩm user dán link (Mua ngay) nhiều nhất.
 *  2. Nhóm ngành hàng được dán nhiều nhất (phân loại theo từ khóa tên sản phẩm —
 *     affiliate_links KHÔNG có category từ sàn nên tự gom theo keyword).
 *  3. Đối tác có mạng lưới lớn nhất (F1 trực tiếp + F2 gián tiếp).
 *  4. Đối tác kiếm nhiều hoa hồng giới thiệu nhất.
 */
export async function registerAdminStatsRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/stats", async (_request, reply) => {
    const [topProducts, topCategories, topNetwork, topRevenue, monthlyCommission] =
      await Promise.all([
        // 1. Sản phẩm dán nhiều nhất (gộp theo platform+product_id).
        query<{
          platform: string;
          product_id: string;
          product_name: string | null;
          image_url: string | null;
          link_count: number;
          user_count: number;
        }>(
          deps.db,
          `SELECT platform, product_id,
             (array_agg(product_name ORDER BY created_at DESC))[1] AS product_name,
             (array_agg(product_image_url ORDER BY created_at DESC))[1] AS image_url,
             count(*)::int AS link_count,
             count(DISTINCT user_id)::int AS user_count
           FROM affiliate_links
           WHERE product_id IS NOT NULL AND product_id <> ''
           GROUP BY platform, product_id
           ORDER BY link_count DESC, user_count DESC
           LIMIT 25`,
        ),
        // 2. Nhóm ngành theo keyword tên sản phẩm.
        query<{ category: string; link_count: number; user_count: number }>(
          deps.db,
          `SELECT category, count(*)::int AS link_count,
             count(DISTINCT user_id)::int AS user_count
           FROM (
             SELECT user_id, CASE
               WHEN product_name ILIKE '%đồng hồ%' THEN 'Đồng hồ'
               WHEN product_name ILIKE '%váy%' OR product_name ILIKE '%đầm%' THEN 'Váy/Đầm nữ'
               WHEN product_name ILIKE '%áo%' OR product_name ILIKE '%quần%' OR product_name ILIKE '%thun%' OR product_name ILIKE '%khoác%' THEN 'Thời trang'
               WHEN product_name ILIKE '%son%' OR product_name ILIKE '%kem%' OR product_name ILIKE '%serum%' OR product_name ILIKE '%mỹ phẩm%' OR product_name ILIKE '%dưỡng%' OR product_name ILIKE '%tẩy trang%' THEN 'Mỹ phẩm/Skincare'
               WHEN product_name ILIKE '%giày%' OR product_name ILIKE '%dép%' OR product_name ILIKE '%sneaker%' OR product_name ILIKE '%sandal%' THEN 'Giày dép'
               WHEN product_name ILIKE '%túi%' OR product_name ILIKE '%balo%' OR product_name ILIKE '%ba lô%' OR product_name ILIKE '%ví%' THEN 'Túi/Ví/Balo'
               WHEN product_name ILIKE '%điện thoại%' OR product_name ILIKE '%ốp%' OR product_name ILIKE '%sạc%' OR product_name ILIKE '%tai nghe%' OR product_name ILIKE '%cáp%' OR product_name ILIKE '%chuột%' OR product_name ILIKE '%bàn phím%' THEN 'Điện tử/Phụ kiện'
               WHEN product_name ILIKE '%nồi%' OR product_name ILIKE '%chảo%' OR product_name ILIKE '%bếp%' OR product_name ILIKE '%gia dụng%' OR product_name ILIKE '%máy%' THEN 'Gia dụng/Nhà bếp'
               WHEN product_name ILIKE '%sữa%' OR product_name ILIKE '%bánh%' OR product_name ILIKE '%kẹo%' OR product_name ILIKE '%thực phẩm%' OR product_name ILIKE '%đồ ăn%' OR product_name ILIKE '%hạt%' THEN 'Thực phẩm/Đồ ăn'
               WHEN product_name ILIKE '%đồ chơi%' OR product_name ILIKE '%trẻ em%' OR product_name ILIKE '%cho bé%' OR product_name ILIKE '%tã%' OR product_name ILIKE '%bỉm%' THEN 'Mẹ & Bé'
               WHEN product_name ILIKE '%kính%' OR product_name ILIKE '%nhẫn%' OR product_name ILIKE '%vòng%' OR product_name ILIKE '%dây chuyền%' OR product_name ILIKE '%phụ kiện%' THEN 'Phụ kiện/Trang sức'
               ELSE 'Khác'
             END AS category
             FROM affiliate_links
             WHERE product_name IS NOT NULL AND product_name <> ''
           ) t
           GROUP BY category
           ORDER BY link_count DESC`,
        ),
        // 3. Mạng lưới đối tác: F1 (trực tiếp) + F2 (con của F1).
        query<{
          id: string;
          full_name: string;
          email: string;
          is_special_partner: boolean;
          f1_count: number;
          f2_count: number;
        }>(
          deps.db,
          `WITH f1 AS (
             SELECT referred_by_user_id AS partner, count(*)::int AS f1_count
             FROM users WHERE referred_by_user_id IS NOT NULL GROUP BY 1
           ),
           f2 AS (
             SELECT p.referred_by_user_id AS partner, count(*)::int AS f2_count
             FROM users c JOIN users p ON p.id = c.referred_by_user_id
             WHERE p.referred_by_user_id IS NOT NULL
             GROUP BY p.referred_by_user_id
           )
           SELECT u.id, u.full_name, u.email, u.is_special_partner,
             COALESCE(f1.f1_count, 0) AS f1_count,
             COALESCE(f2.f2_count, 0) AS f2_count
           FROM users u
           LEFT JOIN f1 ON f1.partner = u.id
           LEFT JOIN f2 ON f2.partner = u.id
           WHERE u.deleted_at IS NULL
             AND (COALESCE(f1.f1_count,0) > 0 OR COALESCE(f2.f2_count,0) > 0)
           ORDER BY f2_count DESC, f1_count DESC
           LIMIT 25`,
        ),
        // 4. Đối tác kiếm nhiều hoa hồng giới thiệu nhất.
        query<{
          id: string;
          full_name: string;
          email: string;
          reward_vnd: string;
          orders: number;
        }>(
          deps.db,
          `SELECT u.id, u.full_name, u.email,
             SUM(ce.referral_amount_vnd)::text AS reward_vnd,
             count(DISTINCT ce.order_id)::int AS orders
           FROM commission_entries ce
           JOIN users u ON u.id = ce.sharer_user_id
           WHERE ce.sharer_user_id IS NOT NULL AND ce.referral_amount_vnd > 0
           GROUP BY u.id, u.full_name, u.email
           ORDER BY SUM(ce.referral_amount_vnd) DESC
           LIMIT 25`,
        ),
        // 5. Hoa hồng theo tháng (đơn đã duyệt) — cho biểu đồ cột.
        query<{ ym: string; total: string }>(
          deps.db,
          `SELECT to_char(
               date_trunc('month', COALESCE(o.completed_at, o.purchased_at, o.created_at)),
               'YYYY-MM'
             ) AS ym,
             COALESCE(sum(o.commission_vnd), 0)::text AS total
           FROM orders o
           WHERE o.status = 'APPROVED'
             AND COALESCE(o.completed_at, o.purchased_at, o.created_at)
               >= date_trunc('month', now()) - interval '7 months'
           GROUP BY 1`,
        ),
      ]);

    const commissionChart = buildMonthlyBarChart(
      buildMonthlySeries(
        monthlyCommission.rows.map((row) => ({
          ym: row.ym,
          value: Number(row.total),
        })),
      ),
      (value) => formatVnd(value),
    );

    return reply.view("backoffice/stats.njk", {
      pageTitle: "Thống kê",
      backofficeSection: "stats",
      commissionChart,
      topProducts: topProducts.rows,
      topCategories: topCategories.rows,
      topNetwork: topNetwork.rows,
      topRevenue: topRevenue.rows,
    });
  });
}
