import { query, type Database } from "../db.js";

export interface CheckinStatus {
  totalDays: number;
  streak: number;
  justCheckedIn: boolean;
}

function vnToday(): string {
  // Ngày theo giờ VN (UTC+7), dạng YYYY-MM-DD.
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function prevDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Điểm danh 1 lần/ngày cho một tài khoản khi vào ứng dụng. Chèn bản ghi ngày
 * hôm nay (giờ VN) nếu chưa có; trả về tổng số ngày đã điểm danh, chuỗi ngày
 * liên tiếp tính đến hôm nay, và có phải lần điểm danh MỚI của hôm nay không.
 */
export async function recordDailyCheckin(
  db: Database,
  userId: string,
): Promise<CheckinStatus> {
  const inserted = await query(
    db,
    `INSERT INTO daily_checkins (user_id, checkin_date)
     VALUES ($1, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
     ON CONFLICT (user_id, checkin_date) DO NOTHING`,
    [userId],
  );
  const [totalRow, recent] = await Promise.all([
    query<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM daily_checkins WHERE user_id = $1`,
      [userId],
    ),
    query<{ d: string }>(
      db,
      `SELECT checkin_date::text AS d FROM daily_checkins
       WHERE user_id = $1 ORDER BY checkin_date DESC LIMIT 90`,
      [userId],
    ),
  ]);
  const dates = new Set(recent.rows.map((r) => r.d));
  let streak = 0;
  let cursor = vnToday();
  while (dates.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return {
    totalDays: Number(totalRow.rows[0]?.n ?? 0),
    streak,
    justCheckedIn: (inserted.rowCount ?? 0) > 0,
  };
}
