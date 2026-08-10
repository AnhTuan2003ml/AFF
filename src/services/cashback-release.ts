import { query, type Database } from "../db.js";
import {
  moveSplitPendingToAvailable,
  type CommissionAllocation,
} from "./ledger.js";

interface DueOrderRow {
  id: string;
  user_id: string;
  cashback_revision: number;
  sharer_user_id: string | null;
  user_amount_vnd: string | null;
  referral_amount_vnd: string | null;
  platform_amount_vnd: string | null;
}

export interface CashbackReleaseResult {
  released: number;
  amountVnd: number;
}

/**
 * Giải ngân tiền hoàn của các đơn đã Hoàn thành và đã qua thời gian giữ tiền
 * (`business_config.cashback_hold_days`, mốc lưu ở `orders.cashback_available_at`).
 *
 * Tiền chuyển từ ví CHỜ sang ví KHẢ DỤNG bằng bút toán cân bằng, dùng đúng số
 * đã ghi nhận ở `commission_entries` nên không phụ thuộc cấu hình hiện tại.
 * Hàm chạy được lặp lại an toàn nhờ khóa idempotency theo đơn + revision.
 */
export async function releaseDueCashback(
  db: Database,
  options: { limit?: number; actorId?: string } = {},
): Promise<CashbackReleaseResult> {
  const due = await query<DueOrderRow>(
    db,
    `
      SELECT o.id, o.user_id, o.cashback_revision, ce.sharer_user_id,
        ce.user_amount_vnd::text, ce.referral_amount_vnd::text,
        ce.platform_amount_vnd::text
      FROM orders o
      JOIN commission_entries ce
        ON ce.order_id = o.id AND ce.user_id = o.user_id
      WHERE o.status = 'APPROVED'
        AND o.evidence_status = 'VERIFIED'
        AND o.cashback_released_at IS NULL
        AND o.cashback_available_at IS NOT NULL
        AND o.cashback_available_at <= now()
        AND ce.status = 'PENDING'
      ORDER BY o.cashback_available_at ASC
      LIMIT $1
    `,
    [Math.min(Math.max(options.limit ?? 200, 1), 1000)],
  );

  let released = 0;
  let amountVnd = 0;
  for (const row of due.rows) {
    const allocation: CommissionAllocation = {
      buyerUserId: row.user_id,
      buyerVnd: Number(row.user_amount_vnd ?? 0),
      ...(row.sharer_user_id ? { sharerUserId: row.sharer_user_id } : {}),
      sharerVnd: Number(row.referral_amount_vnd ?? 0),
      platformVnd: Number(row.platform_amount_vnd ?? 0),
    };
    if (allocation.buyerVnd <= 0 && allocation.sharerVnd <= 0) {
      await query(
        db,
        "UPDATE orders SET cashback_released_at = now() WHERE id = $1",
        [row.id],
      );
      continue;
    }

    await moveSplitPendingToAvailable(db, {
      orderId: row.id,
      allocation,
      revision: Number(row.cashback_revision ?? 0),
      ...(options.actorId ? { createdBy: options.actorId } : {}),
    });
    await query(
      db,
      "UPDATE commission_entries SET status = 'AVAILABLE' WHERE order_id = $1",
      [row.id],
    );
    await query(
      db,
      "UPDATE orders SET cashback_released_at = now() WHERE id = $1",
      [row.id],
    );
    released += 1;
    amountVnd += allocation.buyerVnd + allocation.sharerVnd;
  }

  return { released, amountVnd };
}
