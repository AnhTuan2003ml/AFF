import { query, withTransaction, type Database } from "../db.js";

/**
 * Voucher Shopee hôm nay — lấy từ shopeeanalytics.com (endpoint công khai, KHÔNG
 * cần trình duyệt/profile). Trả về HTML fragment gồm các <li class="bc_voucher_item">;
 * ta parse mã, tiêu đề, shop, hạn dùng, link "Dùng ngay" (đã giải mã về shopee.vn).
 */

const VOUCHER_LIST_URL =
  "https://www.shopeeanalytics.com/api/voucher/data/voucher-list-today_list.txt";

export interface ShopeeVoucher {
  code: string;
  title: string;
  shopName: string | null;
  label: string | null;
  labelColor: string | null;
  expiryText: string | null;
  usedPercent: number | null;
  logoUrl: string | null;
  useUrl: string;
  detailUrl: string | null;
}

function decodeGotoUrl(href: string): string {
  // href dạng https://goto.shopeeanalytics.com/?url=<encoded shopee url>
  const m = href.match(/[?&]url=([^&"']+)/);
  if (!m) return href;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return href;
  }
}

function pick(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m && m[1] != null ? m[1].trim() : null;
}

/** Parse HTML fragment voucher → danh sách voucher. */
export function parseShopeeVouchers(html: string): ShopeeVoucher[] {
  const parts = html.split('<li class="bc_voucher_item"');
  const out: ShopeeVoucher[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < parts.length; i += 1) {
    const block = parts[i]!.split("</li>")[0] ?? "";

    const code = pick(block, /data-code="([^"]+)"/);
    if (!code || seen.has(code)) continue;

    // "Dùng ngay" = link goto chứa voucherCode/search (giải mã về shopee.vn).
    const useUrlRaw =
      pick(block, /href="(https:\/\/goto\.shopeeanalytics\.com\/[^"]*voucherCode[^"]*)"/) ??
      pick(block, /href="(https:\/\/goto\.shopeeanalytics\.com\/[^"]*search[^"]*)"/);
    if (!useUrlRaw) continue;

    const detailRaw = pick(
      block,
      /class="[^"]*bc_voucher_item_detail[^"]*"\s+href="([^"]+)"/,
    );
    const title =
      pick(
        block,
        /class="bc_voucher_title">[\s\S]*?<span class="bc_voucher_label"[^>]*>[^<]*<\/span>\s*<span>([^<]+)<\/span>/,
      ) ?? pick(block, /<span>Giảm[^<]*<\/span>/);
    if (!title) continue;

    seen.add(code);
    out.push({
      code,
      title,
      shopName: pick(block, /class="bc_voucher_logo"[\s\S]*?<span>([^<]+)<\/span>/),
      label: pick(block, /class="bc_voucher_label"[^>]*>([^<]+)<\/span>/),
      labelColor: pick(block, /class="bc_voucher_label"[^>]*color:\s*([^;"]+)/),
      expiryText: pick(
        block,
        /bc_voucher_color_red[\s\S]*?<span>([^<]+)<\/span>/,
      ),
      usedPercent: (() => {
        const w = pick(block, /bc_voucher_process"><span style="width:\s*(\d+)%/);
        return w ? Number(w) : null;
      })(),
      logoUrl: pick(block, /class="bc_voucher_logo"[\s\S]*?data-src="([^"]+)"/),
      useUrl: decodeGotoUrl(useUrlRaw),
      detailUrl: detailRaw ? decodeGotoUrl(detailRaw) : null,
    });
  }
  return out;
}

/** Lấy voucher từ shopeeanalytics và lưu vào DB (thay toàn bộ). */
export async function refreshShopeeVouchers(
  db: Database,
  fetcher: typeof fetch = fetch,
): Promise<{ count: number }> {
  const res = await fetcher(`${VOUCHER_LIST_URL}?v=${Date.now()}`, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      accept: "text/html,application/xhtml+xml",
      referer: "https://www.shopeeanalytics.com/vn/ma-giam-gia.html",
    },
  });
  if (!res.ok) {
    throw new Error(`shopeeanalytics HTTP ${res.status}`);
  }
  const html = await res.text();
  const vouchers = parseShopeeVouchers(html);
  if (vouchers.length === 0) return { count: 0 };

  await withTransaction(db, async (client) => {
    await query(client, "DELETE FROM shopee_vouchers");
    for (const [position, v] of vouchers.entries()) {
      await query(
        client,
        `INSERT INTO shopee_vouchers (
           position, code, title, shop_name, label, label_color, expiry_text,
           used_percent, logo_url, use_url, detail_url
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          position,
          v.code.slice(0, 60),
          v.title.slice(0, 300),
          v.shopName,
          v.label,
          v.labelColor,
          v.expiryText,
          v.usedPercent,
          v.logoUrl,
          v.useUrl,
          v.detailUrl,
        ],
      );
    }
  });
  return { count: vouchers.length };
}

export interface StoredVoucher {
  code: string;
  title: string;
  shop_name: string | null;
  label: string | null;
  label_color: string | null;
  expiry_text: string | null;
  used_percent: number | null;
  logo_url: string | null;
  use_url: string;
  detail_url: string | null;
}

/** Đọc voucher đã lưu (cho web + app). */
export async function listShopeeVouchers(
  db: Database,
  limit = 60,
): Promise<StoredVoucher[]> {
  const result = await query<StoredVoucher>(
    db,
    `SELECT code, title, shop_name, label, label_color, expiry_text,
       used_percent, logo_url, use_url, detail_url
     FROM shopee_vouchers ORDER BY position LIMIT $1`,
    [limit],
  );
  return result.rows;
}
