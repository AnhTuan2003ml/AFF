import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { isPlatformPurchaseEnabled } from "./affiliate.js";
import { getBusinessConfig } from "./business-config.js";
import { getWalletBalances } from "./ledger.js";
import { getCheckinState, type CheckinStatus } from "./checkin.js";
import {
  getPlatformLeaderboard,
  type PlatformLeaderboard,
} from "./platform-stats.js";

export interface RecentDashboardOrder {
  id: string;
  platform: string;
  platform_order_id: string;
  status: string;
  cashback_vnd: string;
  created_at: Date;
  product_name: string | null;
  product_image_url: string | null;
  cashback_rate_percent: string | null;
}

interface PurchaseStats {
  products: string;
  clicks: string;
}

export interface FeaturedVoucher {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  target_url: string | null;
  badge: string | null;
}

/**
 * Tập hợp toàn bộ dữ liệu cần cho /app trong một lần gọi.
 * Route chỉ chịu trách nhiệm HTTP/render; truy vấn dashboard nằm tại service này.
 */
export async function getAppDashboard(
  db: Database,
  config: AppConfig,
  userId: string,
) {
  const [
    balances,
    recentOrders,
    purchaseStats,
    bankStats,
    businessConfig,
    featuredVoucher,
    interestedCount,
    interestedProducts,
    checkin,
    leaderboard,
  ] = await Promise.all([
    getWalletBalances(db, userId),
    getRecentOrders(db, userId),
    getPurchaseStats(db, userId),
    hasVerifiedBank(db, userId),
    getBusinessConfig(db, config),
    getFeaturedVoucher(db),
    getInterestedCount(db, userId),
    getInterestedProducts(db, userId),
    getCheckinState(db, userId),
    getPlatformLeaderboard(db),
  ]);

  return {
    balances,
    recentOrders,
    purchaseStats,
    interestedCount,
    interestedProducts,
    checkin,
    leaderboard,
    hasVerifiedBank: bankStats,
    platformAvailability: {
      SHOPEE: isPlatformPurchaseEnabled(config, "SHOPEE"),
      TIKTOK: isPlatformPurchaseEnabled(config, "TIKTOK"),
      LAZADA: isPlatformPurchaseEnabled(config, "LAZADA"),
    },
    cashbackRate: businessConfig.buyerCashbackPercent,
    // Thẻ ví ở trang chủ vẽ thanh tiến độ "còn bao nhiêu nữa thì rút được",
    // nên cần đúng ngưỡng đang áp dụng chứ không phải con số viết cứng.
    minWithdrawAmountVnd: businessConfig.minWithdrawAmountVnd,
    featuredVoucher,
  };
}

/** Dữ liệu trang chủ cho KHÁCH (chưa đăng nhập): số dư rỗng, không đơn; tỉ lệ
 *  hoàn + danh sách sàn lấy từ cấu hình để vẫn dán link kiểm tra hoàn tiền. */
export async function getGuestDashboard(db: Database, config: AppConfig) {
  const [businessConfig, leaderboard] = await Promise.all([
    getBusinessConfig(db, config),
    getPlatformLeaderboard(db),
  ]);
  return {
    balances: { pending: 0, available: 0, held: 0, paid: 0 },
    recentOrders: [] as RecentDashboardOrder[],
    purchaseStats: { products: "0", clicks: "0" } as PurchaseStats,
    interestedCount: 0,
    interestedProducts: [] as InterestedProduct[],
    checkin: null as CheckinStatus | null,
    leaderboard,
    hasVerifiedBank: false,
    platformAvailability: {
      SHOPEE: isPlatformPurchaseEnabled(config, "SHOPEE"),
      TIKTOK: isPlatformPurchaseEnabled(config, "TIKTOK"),
      LAZADA: isPlatformPurchaseEnabled(config, "LAZADA"),
    },
    cashbackRate: businessConfig.buyerCashbackPercent,
    minWithdrawAmountVnd: businessConfig.minWithdrawAmountVnd,
    featuredVoucher: null as FeaturedVoucher | null,
  };
}

/** Voucher ưu tiên hiển thị nhất (sort_order nhỏ nhất) — gợi ý bằng popup
 * ngay khi vào trang chính, giống banner khuyến mãi của Shopee. */
async function getFeaturedVoucher(
  db: Database,
): Promise<FeaturedVoucher | null> {
  const result = await query<FeaturedVoucher>(
    db,
    `
      SELECT id, title, description, image_url, target_url, badge
      FROM content_items
      WHERE status = 'PUBLISHED' AND type = 'VOUCHER'
      ORDER BY sort_order, published_at DESC
      LIMIT 1
    `,
  );
  return result.rows[0] ?? null;
}

async function getRecentOrders(
  db: Database,
  userId: string,
): Promise<RecentDashboardOrder[]> {
  const result = await query<RecentDashboardOrder>(
    db,
    `
      SELECT o.id, o.platform, o.platform_order_id, o.status,
        o.cashback_vnd::text, o.created_at,
        l.product_name, l.product_image_url,
        CASE
          WHEN o.order_amount_vnd > 0
          THEN trim(to_char(
            (o.cashback_vnd::numeric / o.order_amount_vnd::numeric) * 100,
            'FM999990.0'
          ))
          ELSE NULL
        END AS cashback_rate_percent
      FROM orders o
      LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
      WHERE o.user_id = $1
      ORDER BY COALESCE(o.purchased_at, o.created_at) DESC
      LIMIT 5
    `,
    [userId],
  );
  return result.rows;
}

async function getPurchaseStats(
  db: Database,
  userId: string,
): Promise<PurchaseStats> {
  const result = await query<PurchaseStats>(
    db,
    `
      SELECT count(*)::text AS products,
        COALESCE(sum(click_count), 0)::text AS clicks
      FROM affiliate_links
      WHERE user_id = $1
        AND campaign = 'instantbuy'
        AND created_at > now() - interval '30 days'
    `,
    [userId],
  );
  return result.rows[0] ?? { products: "0", clicks: "0" };
}

/** Số "sản phẩm quan tâm chưa mua": các lượt bấm Mua ngay (instantbuy) CHƯA có
 *  đơn nào khớp — giữ tới INSTANTBUY_KEEP_DAYS ngày để nhắc người dùng. Gộp
 *  theo sản phẩm để không đếm trùng lượt bấm cùng một món. */
async function getInterestedCount(
  db: Database,
  userId: string,
): Promise<number> {
  const result = await query<{ n: string }>(
    db,
    `
      SELECT count(DISTINCT COALESCE(product_id, id::text))::text AS n
      FROM affiliate_links l
      WHERE l.user_id = $1 AND l.campaign = 'instantbuy'
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id)
    `,
    [userId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export interface InterestedProduct {
  name: string;
  imageUrl: string | null;
  productUrl: string | null;
}

/** Danh sách sản phẩm quan tâm chưa mua (instantbuy chưa thành đơn), gộp theo
 *  sản phẩm, mới nhất trước — để hiển thị ảnh thay vì chỉ đếm số. */
async function getInterestedProducts(
  db: Database,
  userId: string,
  limit = 10,
): Promise<InterestedProduct[]> {
  const result = await query<{
    product_name: string | null;
    product_image_url: string | null;
    normalized_url: string | null;
    created_at: Date;
  }>(
    db,
    `
      SELECT DISTINCT ON (COALESCE(product_id, id::text))
        product_name, product_image_url, normalized_url, created_at
      FROM affiliate_links l
      WHERE l.user_id = $1 AND l.campaign = 'instantbuy'
        AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.affiliate_link_id = l.id)
      ORDER BY COALESCE(product_id, id::text), created_at DESC
      LIMIT $2
    `,
    [userId, limit],
  );
  return result.rows
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .map((r) => ({
      name: r.product_name ?? "Sản phẩm",
      imageUrl: r.product_image_url,
      productUrl: r.normalized_url,
    }));
}

async function hasVerifiedBank(
  db: Database,
  userId: string,
): Promise<boolean> {
  const result = await query<{ verified: boolean }>(
    db,
    `
      SELECT EXISTS(
        SELECT 1 FROM user_bank_accounts
        WHERE user_id = $1 AND status = 'VERIFIED'
      ) AS verified
    `,
    [userId],
  );
  return result.rows[0]?.verified ?? false;
}
