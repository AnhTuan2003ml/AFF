import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import {
  escapeSlackText,
  isSlackSupportEnabled,
  postSupportMessage,
  type SlackLogger,
} from "./slack.js";
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
      await postSupportMessage(
        config,
        `:bust_in_silhouette: *${sender}:* ${escapeSlackText(body)}`,
        {
          channel: thread.channel,
          threadTs: thread.threadTs,
          logger: input.logger,
        },
      );
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

/** Lưu câu trả lời của nhân viên từ Slack vào đúng hội thoại. */
export async function receiveSlackReply(
  db: Database,
  event: SlackMessageEvent,
): Promise<boolean> {
  // Chỉ nhận tin người thật nằm trong thread; bỏ qua bot và subtype sửa/xóa.
  if (event.type !== "message" || event.subtype || event.bot_id) return false;
  if (!event.user || !event.text || !event.channel || !event.ts) return false;
  if (!event.thread_ts || event.thread_ts === event.ts) return false;

  const conversation = await query<{ id: string }>(
    db,
    `
      SELECT id FROM support_conversations
      WHERE slack_channel_id = $1 AND slack_thread_ts = $2
    `,
    [event.channel, event.thread_ts],
  );
  if (!conversation.rows[0]) return false;

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
    [conversation.rows[0].id, body, event.ts],
  );
  if (inserted.rowCount) {
    await query(
      db,
      `UPDATE support_conversations SET updated_at = now() WHERE id = $1`,
      [conversation.rows[0].id],
    );
  }
  return Boolean(inserted.rowCount);
}
