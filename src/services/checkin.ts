import { query, type Database } from "../db.js";

export interface CheckinStatus {
  totalDays: number;
  streak: number;
  checkedInToday: boolean;
  justCheckedIn: boolean;
  /** Danh sách ngày đã điểm danh gần đây (YYYY-MM-DD) để vẽ lịch. */
  dates: string[];
  today: string;
}

function vnToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

function prevDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function computeState(
  db: Database,
  userId: string,
  justCheckedIn: boolean,
): Promise<CheckinStatus> {
  const [totalRow, recent] = await Promise.all([
    query<{ n: string }>(
      db,
      `SELECT count(*)::text AS n FROM daily_checkins WHERE user_id = $1`,
      [userId],
    ),
    query<{ d: string }>(
      db,
      `SELECT checkin_date::text AS d FROM daily_checkins
       WHERE user_id = $1 ORDER BY checkin_date DESC LIMIT 120`,
      [userId],
    ),
  ]);
  const dates = recent.rows.map((r) => r.d);
  const set = new Set(dates);
  const today = vnToday();
  let streak = 0;
  let cursor = today;
  while (set.has(cursor)) {
    streak += 1;
    cursor = prevDay(cursor);
  }
  return {
    totalDays: Number(totalRow.rows[0]?.n ?? 0),
    streak,
    checkedInToday: set.has(today),
    justCheckedIn,
    dates,
    today,
  };
}

/** Đọc trạng thái điểm danh (không ghi) — cho badge/menu. */
export function getCheckinState(
  db: Database,
  userId: string,
): Promise<CheckinStatus> {
  return computeState(db, userId, false);
}

/**
 * Điểm danh ngày hôm nay (giờ VN) cho một tài khoản. Chèn nếu chưa có; trả về
 * trạng thái mới (tổng ngày, chuỗi liên tiếp, danh sách ngày để vẽ lịch).
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
  return computeState(db, userId, (inserted.rowCount ?? 0) > 0);
}
