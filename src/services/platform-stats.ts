import { query, type Database } from "../db.js";

export interface TopBuyer {
  name: string;
  count: number;
}
export interface TopProduct {
  name: string;
  imageUrl: string | null;
  count: number;
}
export interface PlatformLeaderboard {
  topBuyers: TopBuyer[];
  topProducts: TopProduct[];
}

/** Che bớt tên người mua để bảo vệ riêng tư: giữ tên gọi (từ cuối), viết tắt
 *  phần họ đệm. "Nguyễn Văn An" → "N. V. An". */
function maskName(full: string): string {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Người dùng";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase() + "•••";
  const last = parts[parts.length - 1]!;
  const initials = parts
    .slice(0, -1)
    .map((p) => p.charAt(0).toUpperCase() + ".")
    .join(" ");
  return `${initials} ${last}`;
}

/** Bảng vàng nền tảng: top người mua nhiều nhất + top sản phẩm được mua nhiều
 *  nhất (đếm đơn đã APPROVED). */
export async function getPlatformLeaderboard(
  db: Database,
): Promise<PlatformLeaderboard> {
  const [buyers, products] = await Promise.all([
    query<{ full_name: string; n: string }>(
      db,
      `
        SELECT u.full_name, count(*)::text AS n
        FROM orders o JOIN users u ON u.id = o.user_id
        WHERE o.status = 'APPROVED'
        GROUP BY u.id, u.full_name
        ORDER BY count(*) DESC, u.full_name
        LIMIT 5
      `,
    ),
    query<{
      product_name: string | null;
      product_image_url: string | null;
      n: string;
    }>(
      db,
      `
        SELECT l.product_name, l.product_image_url, count(*)::text AS n
        FROM orders o JOIN affiliate_links l ON l.id = o.affiliate_link_id
        WHERE o.status = 'APPROVED' AND l.product_name IS NOT NULL
        GROUP BY l.product_name, l.product_image_url
        ORDER BY count(*) DESC
        LIMIT 5
      `,
    ),
  ]);
  return {
    topBuyers: buyers.rows.map((r) => ({
      name: maskName(r.full_name),
      count: Number(r.n),
    })),
    topProducts: products.rows.map((r) => ({
      name: r.product_name ?? "Sản phẩm",
      imageUrl: r.product_image_url,
      count: Number(r.n),
    })),
  };
}
