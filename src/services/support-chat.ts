import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import {
  deleteSlackMessage,
  escapeSlackText,
  isSlackSupportEnabled,
  postSupportMessage,
  type SlackLogger,
} from "./slack.js";
import { camioVoice } from "./camio-voice.js";
import { createNotification } from "./mission.js";
import { maybeAutoReply } from "./support-autoreply.js";

// Mỗi người dùng có một hội thoại ánh xạ 1-1 với một thread Slack. Slack lỗi
// thì tin của khách vẫn được lưu và hiển thị bình thường.

export interface SupportChatMessage {
  id: string;
  authorRole: "USER" | "AGENT";
  body: string;
  createdAt: Date;
}

interface ConversationRow {
  id: string;
  slack_channel_id: string;
  slack_thread_ts: string;
}

async function getOrCreateConversation(
  db: Database,
  userId: string,
): Promise<ConversationRow> {
  const inserted = await query<ConversationRow>(
    db,
    `
      INSERT INTO support_conversations (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
      RETURNING id, slack_channel_id, slack_thread_ts
    `,
    [userId],
  );
  return inserted.rows[0]!;
}

export async function listSupportChatMessages(
  db: Database,
  userId: string,
  limit = 200,
): Promise<SupportChatMessage[]> {
  const result = await query<{
    id: string;
    author_role: "USER" | "AGENT";
    body: string;
    created_at: Date;
  }>(
    db,
    `
      SELECT m.id, m.author_role, m.body, m.created_at
      FROM support_chat_messages m
      JOIN support_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
    `,
    [userId, limit],
  );
  return result.rows.reverse().map((row) => ({
    id: row.id,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
  }));
}

// Số phản hồi CSKH (tin AGENT) khách chưa xem — mốc là user_last_read_at.
export async function countUnreadSupportReplies(
  db: Database,
  userId: string,
): Promise<number> {
  const result = await query<{ count: string }>(
    db,
    `
      SELECT count(*)::text AS count
      FROM support_chat_messages m
      JOIN support_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1
        AND m.author_role = 'AGENT'
        AND m.created_at > c.user_last_read_at
    `,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

// Nội dung phản hồi CSKH MỚI NHẤT mà khách chưa xem — để hiện trong bong bóng
// thoại của linh vật (giải quyết theo từng yêu cầu, không cần lịch sử).
export async function getLatestUnreadSupportReply(
  db: Database,
  userId: string,
): Promise<string> {
  const result = await query<{ body: string }>(
    db,
    `
      SELECT m.body
      FROM support_chat_messages m
      JOIN support_conversations c ON c.id = m.conversation_id
      WHERE c.user_id = $1
        AND m.author_role = 'AGENT'
        AND m.created_at > c.user_last_read_at
      ORDER BY m.created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  return result.rows[0]?.body ?? "";
}

// Trao đổi GẦN NHẤT: yêu cầu mới nhất của khách + phản hồi mới nhất của CSKH.
// Chỉ lấy một cặp gần nhất — không hiện lịch sử quá khứ.
export interface SupportExchangeMessage {
  body: string;
  createdAt: Date;
}
export async function getLatestSupportExchange(
  db: Database,
  userId: string,
): Promise<{
  request: SupportExchangeMessage | null;
  reply: SupportExchangeMessage | null;
}> {
  const latest = async (role: "USER" | "AGENT") => {
    const r = await query<{ body: string; created_at: Date }>(
      db,
      `
        SELECT m.body, m.created_at
        FROM support_chat_messages m
        JOIN support_conversations c ON c.id = m.conversation_id
        WHERE c.user_id = $1 AND m.author_role = $2
        ORDER BY m.created_at DESC
        LIMIT 1
      `,
      [userId, role],
    );
    return r.rows[0]
      ? { body: r.rows[0].body, createdAt: r.rows[0].created_at }
      : null;
  };
  const [request, reply] = await Promise.all([latest("USER"), latest("AGENT")]);
  return { request, reply };
}

// Đánh dấu khách đã xem hỗ trợ tới thời điểm hiện tại (mở trang / poll tin).
export async function markSupportRead(
  db: Database,
  userId: string,
): Promise<void> {
  await query(
    db,
    `UPDATE support_conversations SET user_last_read_at = now() WHERE user_id = $1`,
    [userId],
  );
}

// Tin gốc của thread mang hồ sơ khách để nhân viên khỏi tra cứu chéo.
async function buildThreadRootMessage(
  db: Database,
  config: AppConfig,
  userId: string,
  userEmail: string,
): Promise<string> {
  const profile = await query<{
    id: string;
    full_name: string;
    email: string;
    created_at: Date;
    orders_count: string;
  }>(
    db,
    `
      SELECT u.id, u.full_name, u.email, u.created_at,
        (SELECT count(*) FROM orders o WHERE o.user_id = u.id)::text
          AS orders_count
      FROM users u WHERE u.id = $1
    `,
    [userId],
  );
  const row = profile.rows[0];
  if (!row) {
    return [
      `:sos: *Hội thoại hỗ trợ mới* — ${escapeSlackText(userEmail)}`,
      "Trả lời ngay trong thread này để gửi trực tiếp cho khách hàng.",
    ].join("\n");
  }
  const registeredAt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
  }).format(new Date(row.created_at));
  return [
    ":sos: *Hội thoại hỗ trợ mới*",
    `*Khách:* ${escapeSlackText(row.full_name)} (${escapeSlackText(row.email)})`,
    `*Đăng ký:* ${registeredAt} · *Số đơn:* ${row.orders_count}`,
    `<${config.APP_ORIGIN}/backoffice/accounts/${row.id}|Mở hồ sơ trong Backoffice>`,
    "Trả lời ngay trong thread này để gửi trực tiếp cho khách hàng.",
  ].join("\n");
}

// Chống đua bằng UPDATE điều kiện slack_thread_ts = '' — bên thua dùng thread
// của bên thắng thay vì tạo thread thứ hai.
async function ensureSlackThread(
  db: Database,
  config: AppConfig,
  conversation: ConversationRow,
  userId: string,
  userEmail: string,
  logger?: SlackLogger,
): Promise<{ channel: string; threadTs: string } | null> {
  if (conversation.slack_thread_ts) {
    return {
      channel: conversation.slack_channel_id,
      threadTs: conversation.slack_thread_ts,
    };
  }
  const root = await postSupportMessage(
    config,
    await buildThreadRootMessage(db, config, userId, userEmail),
    { logger },
  );
  if (!root.ok) return null;
  const claimed = await query(
    db,
    `
      UPDATE support_conversations
      SET slack_channel_id = $1, slack_thread_ts = $2, updated_at = now()
      WHERE id = $3 AND slack_thread_ts = ''
    `,
    [root.channel, root.ts, conversation.id],
  );
  if (claimed.rowCount) {
    return { channel: root.channel, threadTs: root.ts };
  }
  const existing = await query<ConversationRow>(
    db,
    `
      SELECT id, slack_channel_id, slack_thread_ts
      FROM support_conversations WHERE id = $1
    `,
    [conversation.id],
  );
  const row = existing.rows[0];
  if (!row?.slack_thread_ts) return null;
  return { channel: row.slack_channel_id, threadTs: row.slack_thread_ts };
}

export async function sendSupportChatMessage(
  db: Database,
  config: AppConfig,
  input: {
    userId: string;
    userEmail: string;
    userFullName?: string;
    body: string;
    /** true = tin cũng hiện ra ngoài kênh Slack (yêu cầu theo mẫu). */
    broadcast?: boolean;
    logger?: SlackLogger;
  },
): Promise<SupportChatMessage> {
  const body = input.body.trim();
  if (body.length < 1 || body.length > 3000) {
    throw new AppError(
      "INVALID_MESSAGE",
      "Tin nhắn cần từ 1 đến 3000 ký tự.",
      400,
    );
  }
  const conversation = await getOrCreateConversation(db, input.userId);
  const saved = await query<{ id: string; created_at: Date }>(
    db,
    `
      INSERT INTO support_chat_messages (conversation_id, author_role, body)
      VALUES ($1, 'USER', $2)
      RETURNING id, created_at
    `,
    [conversation.id, body],
  );

  if (isSlackSupportEnabled(config)) {
    const thread = await ensureSlackThread(
      db,
      config,
      conversation,
      input.userId,
      input.userEmail,
      input.logger,
    );
    if (thread) {
      const sender = escapeSlackText(input.userFullName || input.userEmail);
      const text = `:bust_in_silhouette: *${sender}:* ${escapeSlackText(body)}`;
      const posted = await postSupportMessage(config, text, {
        channel: thread.channel,
        threadTs: thread.threadTs,
        replyBroadcast: input.broadcast,
        logger: input.logger,
      });
      let deliveredTs = posted.ok && !posted.threadBroken ? posted.ts : "";
      if (posted.threadBroken) {
        // Tin gốc của thread đã bị xóa trên Slack (Slack có thể vẫn trả ok
        // và đăng tin ra ngoài kênh): dọn tin lạc, mở thread mới rồi gửi lại.
        input.logger?.warn(
          { conversationId: conversation.id, threadTs: thread.threadTs },
          "Thread Slack của hội thoại không còn — tạo thread mới.",
        );
        if (posted.ok && posted.ts) {
          await deleteSlackMessage(config, posted.channel, posted.ts, input.logger);
        }
        await query(
          db,
          `
            UPDATE support_conversations
            SET slack_channel_id = '', slack_thread_ts = '', updated_at = now()
            WHERE id = $1 AND slack_thread_ts = $2
          `,
          [conversation.id, thread.threadTs],
        );
        const rebuilt = await ensureSlackThread(
          db,
          config,
          { ...conversation, slack_channel_id: "", slack_thread_ts: "" },
          input.userId,
          input.userEmail,
          input.logger,
        );
        if (rebuilt) {
          const reposted = await postSupportMessage(config, text, {
            channel: rebuilt.channel,
            threadTs: rebuilt.threadTs,
            replyBroadcast: input.broadcast,
            logger: input.logger,
          });
          if (reposted.ok && !reposted.threadBroken) deliveredTs = reposted.ts;
        }
      }
      if (deliveredTs) {
        // Lưu ts phía Slack của tin vừa gửi: nếu CSKH lỡ trả lời trong thread
        // của chính tin này (thay vì thread gốc của hội thoại), hệ thống vẫn
        // định tuyến câu trả lời về đúng khách hàng.
        await query(
          db,
          `UPDATE support_chat_messages SET slack_ts = $1 WHERE id = $2`,
          [deliveredTs, saved.rows[0]!.id],
        );
      }
    }
  }

  void maybeAutoReply(db, config, {
    conversationId: conversation.id,
    ...(input.logger ? { logger: input.logger } : {}),
  });

  return {
    id: saved.rows[0]!.id,
    authorRole: "USER",
    body,
    createdAt: saved.rows[0]!.created_at,
  };
}


export interface SlackMessageEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
}

/**
 * Kết quả xử lý một sự kiện tin nhắn từ Slack:
 * - `STORED`    — đã lưu và sẽ hiện cho khách hàng.
 * - `DUPLICATE` — Slack gửi lại sự kiện đã xử lý; bỏ qua êm.
 * - `UNMATCHED` — tin người thật nhưng không nối được với hội thoại nào
 *                 (ngoài thread, hoặc thread không thuộc khách nào) — nên
 *                 nhắc nhân viên.
 * - `IGNORED`   — bot/subtype/thiếu dữ liệu, không cần quan tâm.
 */
export type SlackReplyOutcome =
  | "STORED"
  | "DUPLICATE"
  | "UNMATCHED"
  | "IGNORED";

/** Lưu câu trả lời của nhân viên từ Slack vào đúng hội thoại. */
export async function receiveSlackReply(
  db: Database,
  event: SlackMessageEvent,
): Promise<SlackReplyOutcome> {
  // Chỉ nhận tin người thật; bỏ qua bot và subtype sửa/xóa.
  if (event.type !== "message" || event.subtype || event.bot_id) {
    return "IGNORED";
  }
  if (!event.user || !event.text || !event.channel || !event.ts) {
    return "IGNORED";
  }
  // Tin gõ thẳng ra kênh (ngoài thread) không thuộc khách nào.
  if (!event.thread_ts || event.thread_ts === event.ts) return "UNMATCHED";

  const conversation = await query<{ id: string; user_id: string }>(
    db,
    `
      SELECT id, user_id FROM support_conversations
      WHERE slack_channel_id = $1 AND slack_thread_ts = $2
    `,
    [event.channel, event.thread_ts],
  );
  let conversationId = conversation.rows[0]?.id ?? null;
  let conversationUserId = conversation.rows[0]?.user_id ?? null;
  if (!conversationId) {
    // CSKH có thể trả lời dưới một tin của khách bị văng ra ngoài kênh
    // (thread gốc từng bị xóa): tra ngược ts tin đã gửi để tìm hội thoại.
    const byMessage = await query<{ id: string; user_id: string }>(
      db,
      `
        SELECT c.id, c.user_id
        FROM support_chat_messages m
        JOIN support_conversations c ON c.id = m.conversation_id
        WHERE m.slack_ts = $1
          AND (c.slack_channel_id = $2 OR c.slack_channel_id = '')
        LIMIT 1
      `,
      [event.thread_ts, event.channel],
    );
    conversationId = byMessage.rows[0]?.id ?? null;
    conversationUserId = byMessage.rows[0]?.user_id ?? null;
  }
  if (!conversationId) return "UNMATCHED";

  const body = event.text.slice(0, 3000);
  const inserted = await query(
    db,
    `
      INSERT INTO support_chat_messages (
        conversation_id, author_role, body, slack_ts
      ) VALUES ($1, 'AGENT', $2, $3)
      ON CONFLICT (conversation_id, slack_ts) WHERE slack_ts IS NOT NULL
      DO NOTHING
    `,
    [conversationId, body, event.ts],
  );
  if (!inserted.rowCount) return "DUPLICATE";
  await query(
    db,
    `UPDATE support_conversations SET updated_at = now() WHERE id = $1`,
    [conversationId],
  );
  // Báo cho khách như mọi thông báo khác: vào danh sách Thông báo + đẩy ra
  // ngoài app (push). Web không đếm loại này vào chuông vì đã có bộ đếm phản
  // hồi CSKH riêng (WEB_BELL_EXCLUDED_TYPES).
  if (conversationUserId) {
    await createNotification(db, {
      userId: conversationUserId,
      type: "SUPPORT_REPLY",
      ...camioVoice.supportReply({ preview: body }),
    });
  }
  return "STORED";
}

/**
 * Nhân viên nhắn trong kênh CSKH nhưng tin KHÔNG nối được với hội thoại của
 * khách nào (gõ thẳng ra kênh, hoặc trả lời trong một thread lạ) — nhắc ngay
 * tại chỗ để họ trả lời lại đúng thread. Chỉ áp dụng cho người thật, đúng
 * kênh CSKH đã cấu hình.
 */
export async function warnOffThreadAgentMessage(
  config: AppConfig,
  event: SlackMessageEvent,
  logger?: SlackLogger,
): Promise<void> {
  if (!isSlackSupportEnabled(config)) return;
  if (event.type !== "message" || event.subtype || event.bot_id) return;
  if (!event.user || !event.text || !event.channel || !event.ts) return;
  if (event.channel !== config.SLACK_SUPPORT_CHANNEL) return;
  await postSupportMessage(
    config,
    ":warning: Tin nhắn này KHÔNG được gửi tới khách hàng vì không thuộc thread hội thoại nào. Hãy bấm \"Reply in thread\" trong thread \"Hội thoại hỗ trợ mới\" của khách rồi gửi lại.",
    { channel: event.channel, threadTs: event.thread_ts ?? event.ts, logger },
  );
}
