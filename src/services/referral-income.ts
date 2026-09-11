import { query, type Database } from "../db.js";
import { formatVnd } from "../lib/format.js";
import {
  buildIncomeSeries,
  buildMultiSeriesLineChart,
  type IncomeUnit,
  type MultiSeriesChartData,
  type SeriesPoint,
} from "./chart-data.js";

/** Ba nguồn doanh thu, theo thứ tự và khoá dùng chung cho màu ở web + app. */
export const INCOME_SOURCES = [
  { key: "own", vi: "Đơn của bạn", en: "Your orders" },
  { key: "referral", vi: "Người bạn giới thiệu", en: "Referred users" },
  { key: "shareLink", vi: "Mua qua link chia sẻ", en: "Via shared links" },
] as const;

export interface IncomeSeries {
  own: SeriesPoint[];
  referral: SeriesPoint[];
  shareLink: SeriesPoint[];
}

/**
 * Biểu đồ nhiều đường: mỗi nguồn doanh thu một màu. Nhãn tên nguồn tuỳ ngôn
 * ngữ (chú thích/legend hiển thị riêng ở view).
 */
export function buildIncomeChart(
  series: IncomeSeries,
  lang = "vi",
): MultiSeriesChartData {
  const label = (s: (typeof INCOME_SOURCES)[number]) =>
    lang === "en" ? s.en : s.vi;
  return buildMultiSeriesLineChart(
    [
      { key: "own", label: label(INCOME_SOURCES[0]), points: series.own },
      {
        key: "referral",
        label: label(INCOME_SOURCES[1]),
        points: series.referral,
      },
      {
        key: "shareLink",
        label: label(INCOME_SOURCES[2]),
        points: series.shareLink,
      },
    ],
    (value) => formatVnd(value),
    {
      width: 640,
      height: 300,
      padLeft: 56,
      padRight: 18,
      padTop: 18,
      padBottom: 40,
      labelFont: 15,
      maxXLabels: 7,
    },
  );
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
  series: IncomeSeries;
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

  const [ownRows, sharerRows] = await Promise.all([
    // Nguồn 1: hoàn tiền đơn của CHÍNH mình, theo mốc thời gian.
    query<{ bucket: string; total: string }>(
      db,
      `
        SELECT to_char(date_trunc($2, created_at), 'YYYY-MM-DD') AS bucket,
          COALESCE(sum(user_amount_vnd), 0)::text AS total
          FROM commission_entries
         WHERE user_id = $1 AND status <> 'REVERSED'
           AND created_at >= $3::date AND created_at < ($4::date + interval '1 day')
        GROUP BY 1
      `,
      [userId, unit, from, to],
    ),
    // Nguồn 2 & 3: hoa hồng sharer, tách theo mốc + người mua do U giới thiệu hay không.
    query<{ bucket: string; referral: string; sharelink: string }>(
      db,
      `
        SELECT to_char(date_trunc($2, ce.created_at), 'YYYY-MM-DD') AS bucket,
          COALESCE(sum(ce.referral_amount_vnd)
            FILTER (WHERE b.referred_by_user_id = $1), 0)::text AS referral,
          COALESCE(sum(ce.referral_amount_vnd)
            FILTER (WHERE b.referred_by_user_id IS DISTINCT FROM $1), 0)::text AS sharelink
        FROM commission_entries ce
        JOIN orders o ON o.id = ce.order_id
        JOIN users b ON b.id = o.user_id
        WHERE ce.sharer_user_id = $1 AND ce.status <> 'REVERSED'
          AND ce.created_at >= $3::date AND ce.created_at < ($4::date + interval '1 day')
        GROUP BY 1
      `,
      [userId, unit, from, to],
    ),
  ]);

  const toSeries = (rows: { bucket: string; value: number }[]): SeriesPoint[] =>
    buildIncomeSeries(rows, fromDate, toDate, unit);

  const own = toSeries(
    ownRows.rows.map((row) => ({ bucket: row.bucket, value: Number(row.total) })),
  );
  const referral = toSeries(
    sharerRows.rows.map((row) => ({
      bucket: row.bucket,
      value: Number(row.referral),
    })),
  );
  const shareLink = toSeries(
    sharerRows.rows.map((row) => ({
      bucket: row.bucket,
      value: Number(row.sharelink),
    })),
  );

  // Tổng mỗi nguồn = cộng các mốc (khoảng ngày đã khớp nên bằng tổng tuyệt đối).
  const sum = (points: SeriesPoint[]) =>
    points.reduce((acc, point) => acc + point.value, 0);
  const ownVnd = sum(own);
  const referralVnd = sum(referral);
  const shareLinkVnd = sum(shareLink);

  return {
    series: { own, referral, shareLink },
    breakdown: {
      ownVnd,
      referralVnd,
      shareLinkVnd,
      totalVnd: ownVnd + referralVnd + shareLinkVnd,
    },
  };
}
