import { query, type Database, type Transaction } from "../db.js";

/**
 * Đẩy thông báo ra ngoài app qua Expo Push Service — để app báo cho điện thoại
 * như các ứng dụng khác (kể cả khi app đang đóng). Token thiết bị lưu ở
 * `push_tokens`; mỗi lần tạo notification trong DB sẽ bắn kèm một push.
 *
 * Lưu ý: push tới thiết bị chỉ hoạt động trên BẢN BUILD thật (dev/production),
 * KHÔNG chạy trong Expo Go từ SDK 53+. Trên Android bản build còn phải nhúng
 * `google-services.json` (FCM) và EAS phải có khóa FCM V1 — thiếu thì app không
 * lấy được token, bảng `push_tokens` trống và người dùng chỉ thấy thông báo khi
 * mở app. Xem docs/09-huong-dan-build-android.md.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_CHANNEL_ID = "shoptik-alerts";
const PUSH_SOUND = "shoptik_notify.wav";
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

/** Một "ticket" Expo trả về cho từng message gửi đi (cùng thứ tự với mảng gửi). */
interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Gửi push tới TẤT CẢ thiết bị của một người dùng. Fire-and-forget: lỗi mạng
 * hay token hỏng không được làm hỏng luồng nghiệp vụ gọi nó. Token mà Expo báo
 * `DeviceNotRegistered` (app đã gỡ / token cũ) thì xóa luôn để lần sau khỏi gửi.
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

  const tokens = rows.rows.map((r) => r.token);
  const messages = tokens.map((token) => ({
    to: token,
    title: msg.title,
    body: msg.body,
    // iOS: tên file chuông riêng đã bundle qua plugin expo-notifications.
    // Android bỏ qua trường này — âm thanh/rung lấy theo kênh bên dưới.
    sound: PUSH_SOUND,
    // Trùng CHANNEL_ID trong mobile/src/lib/push.ts (kênh MAX: chuông riêng,
    // rung, đèn, heads-up). Đổi kênh bên app thì đổi cả đây.
    channelId: PUSH_CHANNEL_ID,
    priority: "high",
    data: msg.data ?? {},
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Expo Push trả HTTP ${response.status} khi gửi cho user ${userId}`);
      return;
    }
    const payload = (await response.json().catch(() => null)) as
      | { data?: ExpoPushTicket[] }
      | null;
    const tickets = payload?.data ?? [];
    const deadTokens: string[] = [];
    tickets.forEach((ticket, i) => {
      if (ticket.status !== "error") return;
      const token = tokens[i];
      console.warn(
        `Expo Push từ chối token của user ${userId}: ${ticket.details?.error ?? "?"} — ${ticket.message ?? ""}`,
      );
      if (token && ticket.details?.error === "DeviceNotRegistered") deadTokens.push(token);
    });
    if (deadTokens.length > 0) {
      await query(db, `DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [deadTokens]);
    }
  } catch (error) {
    // Bỏ qua: push là phụ, không được chặn nghiệp vụ chính — chỉ ghi log để soi.
    console.warn(`Không gửi được push cho user ${userId}`, error);
  }
}
