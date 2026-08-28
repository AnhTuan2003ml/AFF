import { query, type Database } from "../db.js";

/**
 * Số việc đang chờ xử lý ở khu vận hành — nguồn DUY NHẤT cho cả badge render
 * lần đầu (hook trong server.ts) lẫn endpoint /backoffice/queue.json mà JS
 * poll để cập nhật gần-realtime không cần tải lại trang.
 */
export interface BackofficeQueueCounts {
  orders: number;
  withdrawals: number;
  missions: number;
  referralCodes: number;
  banks: number;
}

export async function getBackofficeQueueCounts(
  db: Database,
): Promise<BackofficeQueueCounts> {
  const counts = await query<{
    orders_pending_count: string;
    withdrawals_pending_count: string;
    missions_pending_count: string;
    referral_codes_pending_count: string;
    banks_pending_count: string;
  }>(
    db,
    `
      SELECT
        (SELECT count(*) FROM orders WHERE status = 'PENDING')::text
          AS orders_pending_count,
        (SELECT count(*) FROM withdrawals
          WHERE status IN ('FUNDS_HELD', 'UNKNOWN'))::text
          AS withdrawals_pending_count,
        (SELECT count(*) FROM user_mission_claims WHERE status = 'PENDING')::text
          AS missions_pending_count,
        (SELECT count(*) FROM referral_code_requests WHERE status = 'PENDING')::text
          AS referral_codes_pending_count,
        (SELECT count(*) FROM user_bank_accounts WHERE status = 'PENDING_REVIEW')::text
          AS banks_pending_count
    `,
  );
  const row = counts.rows[0];
  return {
    orders: Number(row?.orders_pending_count ?? 0),
    withdrawals: Number(row?.withdrawals_pending_count ?? 0),
    missions: Number(row?.missions_pending_count ?? 0),
    referralCodes: Number(row?.referral_codes_pending_count ?? 0),
    banks: Number(row?.banks_pending_count ?? 0),
  };
}
