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
  /** Nhãn kỳ xếp hạng, ví dụ "Tháng 8/2026" — bảng chỉ tính đơn trong tháng. */
  monthLabel: string;
  /** true khi ít nhất một bảng dùng dữ liệu minh họa vì DB chưa đủ 3 mục. */
  isSample: boolean;
}

/** Dữ liệu minh họa cho podium khi nền tảng chưa đủ 3 mục thật — để giao diện
 *  không trống. Số đơn giảm dần rõ để phân biệt hạng. */
const SAMPLE_BUYERS: TopBuyer[] = [
  { name: "T. M. Hà", count: 128 },
  { name: "N. V. Nam", count: 94 },
  { name: "L. Q. Anh", count: 67 },
];
const SAMPLE_PRODUCTS: TopProduct[] = [
  { name: "Combo dưỡng da 5 món chính hãng", imageUrl: null, count: 156 },
  { name: "Tai nghe Bluetooth chống ồn", imageUrl: null, count: 112 },
  { name: "Nồi chiên không dầu 5L", imageUrl: null, count: 83 },
];

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
          AND o.created_at >= date_trunc('month', now())
        GROUP BY u.id, u.full_name
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
  const useSampleBuyers = buyers.rows.length < 3;
  const useSampleProducts = products.rows.length < 3;
  return {
    topBuyers: useSampleBuyers
      ? SAMPLE_BUYERS
      : buyers.rows.map((r) => ({
          name: maskName(r.full_name),
          count: Number(r.n),
        })),
    topProducts: useSampleProducts
      ? SAMPLE_PRODUCTS
      : products.rows.map((r) => ({
          name: r.product_name ?? "Sản phẩm",
          imageUrl: r.product_image_url,
          count: Number(r.n),
        })),
    monthLabel: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`,
    isSample: useSampleBuyers || useSampleProducts,
  };
}
