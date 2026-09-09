import { query, type Database } from "../db.js";

/**
 * Tín hiệu gian lận cơ bản cho đội vận hành. Dựa trên dữ liệu sẵn có — KHÔNG
 * tự động phạt/khóa, chỉ nêu cờ để người xử lý xem lại:
 *  - Tỷ lệ hủy/hoàn cao bất thường (mua rồi hủy để cày, hoặc lạm dụng).
 *  - Nhiều tài khoản cùng một IP (ip_hash) — dấu hiệu tạo tài khoản ảo.
 */

const MIN_ORDERS_FOR_RATE = 5;
const HIGH_CANCEL_RATE = 0.5;
const SHARED_IP_MIN_ACCOUNTS = 3;

export interface HighCancelRow {
  id: string;
  full_name: string;
  email: string;
  total: number;
  bad: number;
  cancel_rate: number;
}

export interface SharedIpRow {
  accounts: number;
  emails: string[];
}

export interface RiskDashboard {
  highCancel: HighCancelRow[];
  sharedIp: SharedIpRow[];
  thresholds: {
    minOrders: number;
    cancelRatePercent: number;
    sharedIpMinAccounts: number;
  };
}

export async function getRiskDashboard(db: Database): Promise<RiskDashboard> {
  const [highCancel, sharedIp] = await Promise.all([
    query<HighCancelRow>(
      db,
      `
        WITH stats AS (
          SELECT user_id,
            count(*)::int AS total,
            count(*) FILTER (
              WHERE status IN ('CANCELLED', 'INVALID', 'REVERSED')
            )::int AS bad
          FROM orders
          GROUP BY user_id
          HAVING count(*) >= $1
        )
        SELECT u.id, u.full_name, u.email, s.total, s.bad,
          round(s.bad::numeric / s.total * 100)::int AS cancel_rate
        FROM stats s
        JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
        WHERE s.bad::numeric / s.total >= $2
        ORDER BY cancel_rate DESC, s.total DESC
        LIMIT 50
      `,
      [MIN_ORDERS_FOR_RATE, HIGH_CANCEL_RATE],
    ),
    query<SharedIpRow>(
      db,
      `
        SELECT count(DISTINCT s.user_id)::int AS accounts,
          (array_agg(DISTINCT u.email))[1:8] AS emails
        FROM sessions s
        JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
        WHERE s.ip_hash IS NOT NULL
        GROUP BY s.ip_hash
        HAVING count(DISTINCT s.user_id) >= $1
        ORDER BY count(DISTINCT s.user_id) DESC
        LIMIT 50
      `,
      [SHARED_IP_MIN_ACCOUNTS],
    ),
  ]);

  return {
    highCancel: highCancel.rows,
    sharedIp: sharedIp.rows,
    thresholds: {
      minOrders: MIN_ORDERS_FOR_RATE,
      cancelRatePercent: HIGH_CANCEL_RATE * 100,
      sharedIpMinAccounts: SHARED_IP_MIN_ACCOUNTS,
    },
  };
}
