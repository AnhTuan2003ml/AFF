import { query, type Database } from "../db.js";
import { formatVnd } from "../lib/format.js";
import {
  buildIncomeSeries,
  buildSeriesLineChart,
  type IncomeUnit,
  type SeriesPoint,
  type TrendChartData,
} from "./chart-data.js";

/** Dựng biểu đồ đường doanh thu (khung lớn, chữ to, không kéo méo). */
export function buildIncomeChart(points: SeriesPoint[]): TrendChartData {
  return buildSeriesLineChart(points, (value) => formatVnd(value), {
    width: 560,
    height: 320,
    padLeft: 54,
    padRight: 16,
    padTop: 18,
    padBottom: 40,
    labelFont: 16,
    maxXLabels: 7,
  });
}

/**
 * Doanh thu của một tài khoản gồm 3 nguồn (theo yêu cầu nghiệp vụ):
 *  1. own       — hoàn tiền từ ĐƠN CỦA CHÍNH tài khoản (commission_entries.user_id = U).
 *  2. referral  — hoa hồng khi NGƯỜI ĐƯỢC U GIỚI THIỆU mua hàng
 *                 (sharer_user_id = U, người mua có referred_by_user_id = U).
 *  3. shareLink — hoa hồng khi người khác MUA QUA LINK CHIA SẺ của U
 *                 (sharer_user_id = U, người mua KHÔNG phải do U giới thiệu).
 * Không tính khoản đã đảo (status = 'REVERSED').
 */
export interface IncomeBreakdown {
  ownVnd: number;
  referralVnd: number;
  shareLinkVnd: number;
  totalVnd: number;
}

export interface ReferralIncomeResult {
  points: SeriesPoint[];
  breakdown: IncomeBreakdown;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Đọc & chuẩn hoá khoảng ngày + đơn vị từ query. Mặc định: 1 tháng đến HÔM QUA. */
export function parseIncomeRange(q: Record<string, unknown>): {
  fromDate: Date;
  toDate: Date;
  unit: IncomeUnit;
  from: string;
  to: string;
  maxDate: string;
} {
  const unit: IncomeUnit = (["day", "week", "month"] as const).includes(
    String(q.unit) as IncomeUnit,
  )
    ? (String(q.unit) as IncomeUnit)
    : "day";
  const parse = (value: unknown): Date | null => {
    const text = String(value ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const d = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const now = new Date();
  const yesterday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  let toDate = parse(q.to) ?? yesterday;
  const defaultFrom = new Date(toDate);
  defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 1);
  let fromDate = parse(q.from) ?? defaultFrom;
  if (fromDate.getTime() > toDate.getTime()) {
    [fromDate, toDate] = [toDate, fromDate];
  }
  const maxSpanMs = 750 * 24 * 60 * 60 * 1000;
  if (toDate.getTime() - fromDate.getTime() > maxSpanMs) {
    fromDate = new Date(toDate.getTime() - maxSpanMs);
  }
  return {
    fromDate,
    toDate,
    unit,
    from: ymd(fromDate),
    to: ymd(toDate),
    maxDate: ymd(yesterday),
  };
}

export async function loadReferralIncome(
  db: Database,
  userId: string,
  fromDate: Date,
  toDate: Date,
  unit: IncomeUnit,
): Promise<ReferralIncomeResult> {
  const from = ymd(fromDate);
  const to = ymd(toDate);

  const [seriesRows, ownRow, sharerRow] = await Promise.all([
    // Chuỗi theo mốc thời gian: gộp cashback của chính mình + hoa hồng sharer.
    query<{ bucket: string; total: string }>(
      db,
      `
        SELECT to_char(date_trunc($2, t.created_at), 'YYYY-MM-DD') AS bucket,
          COALESCE(sum(t.amt), 0)::text AS total
        FROM (
          SELECT created_at, user_amount_vnd AS amt
            FROM commission_entries
           WHERE user_id = $1 AND status <> 'REVERSED'
          UNION ALL
          SELECT created_at, referral_amount_vnd AS amt
            FROM commission_entries
           WHERE sharer_user_id = $1 AND status <> 'REVERSED'
        ) t
        WHERE t.created_at >= $3::date
          AND t.created_at < ($4::date + interval '1 day')
        GROUP BY 1
      `,
      [userId, unit, from, to],
    ),
    // Nguồn 1: hoàn tiền đơn của chính mình.
    query<{ own: string }>(
      db,
      `
        SELECT COALESCE(sum(user_amount_vnd), 0)::text AS own
          FROM commission_entries
         WHERE user_id = $1 AND status <> 'REVERSED'
           AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
      `,
      [userId, from, to],
    ),
    // Nguồn 2 & 3: hoa hồng sharer, tách theo người mua có do U giới thiệu hay không.
    query<{ referral: string; sharelink: string }>(
      db,
      `
        SELECT
          COALESCE(sum(ce.referral_amount_vnd)
            FILTER (WHERE b.referred_by_user_id = $1), 0)::text AS referral,
          COALESCE(sum(ce.referral_amount_vnd)
            FILTER (WHERE b.referred_by_user_id IS DISTINCT FROM $1), 0)::text AS sharelink
        FROM commission_entries ce
        JOIN orders o ON o.id = ce.order_id
        JOIN users b ON b.id = o.user_id
        WHERE ce.sharer_user_id = $1 AND ce.status <> 'REVERSED'
          AND ce.created_at >= $2::date AND ce.created_at < ($3::date + interval '1 day')
      `,
      [userId, from, to],
    ),
  ]);

  const points = buildIncomeSeries(
    seriesRows.rows.map((row) => ({
      bucket: row.bucket,
      value: Number(row.total),
    })),
    fromDate,
    toDate,
    unit,
  );

  const ownVnd = Number(ownRow.rows[0]?.own ?? 0);
  const referralVnd = Number(sharerRow.rows[0]?.referral ?? 0);
  const shareLinkVnd = Number(sharerRow.rows[0]?.sharelink ?? 0);

  return {
    points,
    breakdown: {
      ownVnd,
      referralVnd,
      shareLinkVnd,
      totalVnd: ownVnd + referralVnd + shareLinkVnd,
    },
  };
}
