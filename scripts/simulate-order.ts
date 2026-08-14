/**
 * Mô phỏng một đơn hàng Shopee về cho một lượt click (theo click_id / mã đối
 * chiếu), chạy đúng luồng đối soát thật `importOrderRow` để kiểm chứng cách
 * tiền hoàn chảy vào ví CHỜ (đang duyệt) rồi sang KHẢ DỤNG.
 *
 *   node dist/scripts/simulate-order.js <click_id> [PENDING|COMPLETED]
 *
 * Mặc định chạy trọn vòng đời: PENDING (đơn về, đang xử lý) → APPROVED
 * (Shopee COMPLETED). In số dư ví trước/sau mỗi bước.
 */
import { loadConfig } from "../src/config.js";
import { createDatabase, query } from "../src/db.js";
import {
  importOrderRow,
  type ImportOrderStatus,
  type OrderImportRow,
} from "../src/services/order-import.js";
import { getWalletBalances } from "../src/services/ledger.js";

interface LinkRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  platform: string;
  sub_id: string;
  product_id: string | null;
  product_name: string | null;
  product_price_vnd: string | null;
  estimated_commission_vnd: string | null;
  estimated_cashback_vnd: string | null;
}

function fmtVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n) + " ₫";
}

async function main(): Promise<void> {
  const clickId = String(process.argv[2] ?? "").trim();
  if (!clickId) {
    throw new Error("Thiếu tham số: node simulate-order.js <click_id> [PENDING|COMPLETED]");
  }
  // Trạng thái muốn mô phỏng. Không truyền = chạy cả hai bước cho trực quan.
  const wantStatusArg = String(process.argv[3] ?? "").trim().toUpperCase();
  const steps: ImportOrderStatus[] =
    wantStatusArg === "PENDING"
      ? ["PENDING"]
      : wantStatusArg === "COMPLETED" || wantStatusArg === "APPROVED"
        ? ["APPROVED"]
        : ["PENDING", "APPROVED"];

  const config = loadConfig();
  const db = createDatabase(config);
  try {
    const link = await query<LinkRow>(
      db,
      `
        SELECT l.id, l.user_id, u.email, u.full_name, l.platform, l.sub_id,
          l.product_id, l.product_name, l.product_price_vnd,
          l.estimated_commission_vnd, l.estimated_cashback_vnd
        FROM affiliate_links l
        JOIN users u ON u.id = l.user_id
        WHERE l.click_id = $1
      `,
      [clickId],
    );
    const row = link.rows[0];
    if (!row) {
      throw new Error(`Không tìm thấy lượt click nào với click_id = ${clickId}`);
    }

    // Lấy 1 admin làm actor cho bút toán/audit; fallback về chính chủ đơn.
    const admin = await query<{ id: string }>(
      db,
      "SELECT id FROM users WHERE role IN ('SUPER_ADMIN','ADMIN','OPERATOR') ORDER BY created_at LIMIT 1",
    );
    const actorId = admin.rows[0]?.id ?? row.user_id;

    const orderAmount = Number(row.product_price_vnd ?? "0") || 0;
    const commission = Number(row.estimated_commission_vnd ?? "0") || 0;
    const platformOrderId = `SIM-${clickId}`;
    const nowIso = new Date().toISOString();

    console.info("── Mô phỏng đơn hàng ─────────────────────────────────");
    console.info(`Khách:        ${row.full_name} <${row.email}>`);
    console.info(`Sản phẩm:     ${row.product_name ?? "—"}`);
    console.info(`Giá trị đơn:  ${fmtVnd(orderAmount)}`);
    console.info(`Hoa hồng sàn: ${fmtVnd(commission)}`);
    console.info(`Mã đối chiếu: ${clickId}`);
    console.info(`Mã đơn (giả): ${platformOrderId}`);
    console.info("");

    const before = await getWalletBalances(db, row.user_id);
    console.info(
      `Ví ban đầu → chờ ${fmtVnd(before.pending)} | khả dụng ${fmtVnd(before.available)}`,
    );
    console.info("");

    for (const status of steps) {
      const label = status === "APPROVED" ? "COMPLETED (hoàn thành)" : "PENDING (đang xử lý)";
      const importRow: OrderImportRow = {
        platform: row.platform,
        platform_order_id: platformOrderId,
        status,
        order_amount_vnd: String(orderAmount),
        commission_vnd: String(commission),
        external_status: status === "APPROVED" ? "COMPLETED" : "PENDING",
        ...(status === "APPROVED" ? { completed_at: nowIso } : {}),
        purchased_at: nowIso,
        click_id: clickId,
        sub_id: row.sub_id,
        items: [
          {
            item_id: row.product_id ?? "0",
            item_name: row.product_name ?? "Sản phẩm mô phỏng",
            quantity: 1,
            amount_vnd: orderAmount,
          },
        ],
      };

      const result = await importOrderRow(db, config, importRow, actorId);
      const wallet = await getWalletBalances(db, row.user_id);
      console.info(`▸ Nhập đơn ở trạng thái ${label}`);
      console.info(`  → order ${result.orderId} · status ${result.status}`);
      console.info(
        `  → ví: chờ ${fmtVnd(wallet.pending)} | khả dụng ${fmtVnd(wallet.available)}`,
      );
      console.info("");
    }

    console.info("Xong. Kiểm tra ở /app/orders và /app/wallet của khách.");
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
