import { query, type Database, type Transaction } from "../db.js";

/**
 * Đẩy thông báo ra ngoài app qua Expo Push Service — để app báo cho điện thoại
 * như các ứng dụng khác (kể cả khi app đang đóng). Token thiết bị lưu ở
 * `push_tokens`; mỗi lần tạo notification trong DB sẽ bắn kèm một push.
 *
 * Lưu ý: push tới thiết bị chỉ hoạt động trên BẢN BUILD thật (dev/production),
 * KHÔNG chạy trong Expo Go từ SDK 53+.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const REQUEST_TIMEOUT_MS = 8000;

/** Lưu token đẩy của một thiết bị; token trùng thì gán lại cho user hiện tại. */
export async function registerPushToken(
  db: Database | Transaction,
  userId: string,
  token: string,
): Promise<void> {
  await query(
    db,
    `
      INSERT INTO push_tokens (user_id, token)
      VALUES ($1, $2)
      ON CONFLICT (token) DO UPDATE SET user_id = $1, updated_at = now()
    `,
    [userId, token],
  );
}

/** Gỡ token khi đăng xuất thiết bị. */
export async function removePushToken(
  db: Database | Transaction,
  token: string,
): Promise<void> {
  await query(db, `DELETE FROM push_tokens WHERE token = $1`, [token]);
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Gửi push tới TẤT CẢ thiết bị của một người dùng. Fire-and-forget: lỗi mạng
 * hay token hỏng không được làm hỏng luồng nghiệp vụ gọi nó.
 */
export async function sendPushToUser(
  db: Database | Transaction,
  userId: string,
  msg: PushMessage,
): Promise<void> {
  const rows = await query<{ token: string }>(
    db,
    `SELECT token FROM push_tokens WHERE user_id = $1`,
    [userId],
  );
  if (rows.rows.length === 0) return;

  const messages = rows.rows.map((r) => ({
    to: r.token,
    title: msg.title,
    body: msg.body,
    sound: "default",
    data: msg.data ?? {},
  }));

  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Bỏ qua: push là phụ, không được chặn nghiệp vụ chính.
  }
}
