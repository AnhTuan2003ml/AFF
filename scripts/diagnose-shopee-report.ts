/**
 * Chẩn đoán đối soát đơn Shopee: gọi ĐÚNG báo cáo chuyển đổi mà lượt đồng bộ
 * dùng (cookie đã lưu), in Sub ID (utm_content) của từng đơn, rồi đối chiếu
 * với các link ShopTik để chỉ ra vì sao đơn không được gán (skipped).
 *
 *   node dist/scripts/diagnose-shopee-report.js [soNgay]
 *
 * Chỉ ĐỌC báo cáo — không ghi gì vào DB.
 */
import { loadConfig } from "../src/config.js";
import { createDatabase, query } from "../src/db.js";
import { getShopeeCookie } from "../src/services/platform-sync-settings.js";
import {
  fetchShopeeReport,
  parseShopeeReportOrders,
} from "../src/services/shopee-report.js";

function norm(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

const config = loadConfig();
const db = createDatabase(config);

const lookbackDays = Number(process.argv[2] ?? "30") || 30;
const nowSec = Math.floor(Date.now() / 1000);

const cookie = await getShopeeCookie(db, config);
if (!cookie) {
  console.error("Chưa có cookie Shopee trong platform_sync_settings.");
  process.exit(1);
}

console.log(`Gọi báo cáo Shopee ${lookbackDays} ngày gần nhất…`);
const report = await fetchShopeeReport(
  cookie,
  { purchaseTimeStart: nowSec - lookbackDays * 86400, purchaseTimeEnd: nowSec },
  fetch,
);
const orders = parseShopeeReportOrders(report.list);
console.log(
  `Báo cáo trả về ${orders.length} đơn (totalCount=${report.totalCount}).\n`,
);

// Lấy toàn bộ link ShopTik để đối chiếu tại chỗ.
const links = await query<{
  click_id: string;
  sub_id: string;
  campaign: string;
  product_id: string | null;
}>(
  db,
  `SELECT click_id, sub_id, campaign, product_id FROM affiliate_links WHERE platform = 'SHOPEE'`,
);
const bySubId = new Set(links.rows.map((r) => r.sub_id));
const byClick = new Set(links.rows.map((r) => r.click_id));
const bySubTokenNorm = new Set(links.rows.map((r) => norm(r.sub_id)));
const byClickNorm = new Set(links.rows.map((r) => norm(`c${r.click_id}`)));

console.log(`Trong DB có ${links.rows.length} link Shopee để đối chiếu.\n`);

for (const o of orders) {
  const sub = o.subId || "(RỖNG)";
  const nsub = norm(o.subId);
  let match = "KHÔNG KHỚP";
  if (bySubId.has(o.subId)) match = "khớp sub_id";
  else if (bySubTokenNorm.has(nsub)) match = "khớp sub_id (chuẩn hóa)";
  else if ([...byClickNorm].some((c) => nsub.startsWith(c) || c.startsWith(nsub)))
    match = "khớp click (tiền tố)";
  else if ([...byClick].some((c) => o.subId.includes(c))) match = "chứa click_id";
  console.log(
    `- ${o.orderSn} | ${o.status}/${o.externalStatus} | HH=${o.commissionVnd} | mua=${o.purchasedAt ?? "?"}\n    utm_content(subId)="${sub}"\n    => ${match}`,
  );
}

process.exit(0);
