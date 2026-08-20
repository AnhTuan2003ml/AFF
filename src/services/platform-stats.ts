import { query, type Database } from "../db.js";

export interface TopBuyer {
  name: string;
  count: number;
  avatarUrl: string | null;
}
export interface TopProduct {
  name: string;
  imageUrl: string | null;
  count: number;
}
export interface PlatformLeaderboard {
  topBuyers: TopBuyer[];
  topProducts: TopProduct[];
  /** Nhãn kỳ xếp hạng, ví dụ "Tháng 8/2026" — bảng chỉ tính đơn trong tháng. */
  monthLabel: string;
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
    query<{ id: string; full_name: string; avatar_url: string | null; n: string }>(
      db,
      `
        SELECT u.id, u.full_name, u.avatar_url, count(*)::text AS n
        FROM orders o JOIN users u ON u.id = o.user_id
        WHERE o.status = 'APPROVED'
          AND o.created_at >= date_trunc('month', now())
        GROUP BY u.id, u.full_name, u.avatar_url
        ORDER BY count(*) DESC, u.full_name
        LIMIT 3
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
          AND o.created_at >= date_trunc('month', now())
        GROUP BY l.product_name, l.product_image_url
        ORDER BY count(*) DESC
        LIMIT 3
      `,
    ),
  ]);
  const now = new Date();
  const topBuyers: TopBuyer[] = buyers.rows.map((r) => ({
    name: maskName(r.full_name),
    count: Number(r.n),
    avatarUrl: r.avatar_url && r.avatar_url.length > 0 ? r.avatar_url : null,
  }));
  const topProducts: TopProduct[] = products.rows.map((r) => ({
    name: r.product_name ?? "Sản phẩm",
    imageUrl: r.product_image_url,
    count: Number(r.n),
  }));

  // Chưa đủ 3 hạng theo đơn trong tháng → lấp bằng thành viên / sản phẩm THẬT
  // khác trong DB, theo THỨ TỰ CỐ ĐỊNH (không ngẫu nhiên) nên đồng nhất mọi
  // thiết bị. Đơn trong tháng của họ là 0 nên vẫn xếp sau hạng có đơn.
  if (topBuyers.length < 3) {
    const usedIds = new Set(buyers.rows.map((r) => r.id));
    const fill = await query<{ id: string; full_name: string; avatar_url: string | null }>(
      db,
      `
        SELECT id, full_name, avatar_url
        FROM users
        WHERE full_name IS NOT NULL AND full_name <> '' AND role = 'USER'
        ORDER BY created_at ASC, id ASC
        LIMIT 8
      `,
    );
    for (const r of fill.rows) {
      if (topBuyers.length >= 3) break;
      if (usedIds.has(r.id)) continue;
      usedIds.add(r.id);
      topBuyers.push({
        name: maskName(r.full_name),
        count: 0,
        avatarUrl: r.avatar_url && r.avatar_url.length > 0 ? r.avatar_url : null,
      });
    }
  }
  if (topProducts.length < 3) {
    const usedNames = new Set(topProducts.map((p) => p.name));
    const fill = await query<{ product_name: string | null; product_image_url: string | null }>(
      db,
      `
        SELECT DISTINCT ON (product_name) product_name, product_image_url
        FROM affiliate_links
        WHERE product_name IS NOT NULL AND product_name <> ''
        ORDER BY product_name ASC
        LIMIT 8
      `,
    );
    for (const r of fill.rows) {
      if (topProducts.length >= 3) break;
      const name = r.product_name ?? "Sản phẩm";
      if (usedNames.has(name)) continue;
      usedNames.add(name);
      topProducts.push({ name, imageUrl: r.product_image_url, count: 0 });
    }
  }

  return {
    topBuyers,
    topProducts,
    monthLabel: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
  };
}
