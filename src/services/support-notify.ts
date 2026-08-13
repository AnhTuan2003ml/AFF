import { query, type Database } from "../db.js";
import type { EmailService } from "./email.js";
import type { SlackLogger } from "./slack.js";
import type { SlackMessageEvent } from "./support-chat.js";

// Khi CSKH trả lời (qua Slack), gửi email báo cho khách: nhắc lại vấn đề họ
// hỏi và nội dung phản hồi. Địa chỉ nhận là email điền trong form hỗ trợ
// (support_conversations.notify_email); trống thì dùng email đăng ký.

/** Nhân viên nhắn nhiều tin liên tiếp: chỉ email cho tin đầu trong khoảng này. */
const AGENT_EMAIL_DEBOUNCE_MINUTES = 10;

export async function notifySupportReplyByEmail(
  db: Database,
  emailService: EmailService,
  event: SlackMessageEvent,
  logger?: SlackLogger,
): Promise<boolean> {
  if (!event.ts) return false;
  try {
    const stored = await query<{
      id: string;
      conversation_id: string;
      body: string;
      created_at: Date;
    }>(
      db,
      `
        SELECT id, conversation_id, body, created_at
        FROM support_chat_messages
        WHERE slack_ts = $1 AND author_role = 'AGENT'
        LIMIT 1
      `,
      [event.ts],
    );
    const reply = stored.rows[0];
    if (!reply) return false;

    const recentAgent = await query(
      db,
      `
        SELECT 1 FROM support_chat_messages
        WHERE conversation_id = $1 AND author_role = 'AGENT' AND id <> $2
          AND created_at > $3::timestamptz
            - interval '${AGENT_EMAIL_DEBOUNCE_MINUTES} minutes'
          AND created_at <= $3::timestamptz
        LIMIT 1
      `,
      [reply.conversation_id, reply.id, reply.created_at],
    );
    if (recentAgent.rows.length) return false;

    const context = await query<{
      notify_email: string;
      email: string;
      full_name: string;
      question: string | null;
    }>(
      db,
      `
        SELECT c.notify_email, u.email, u.full_name,
          (
            SELECT body FROM support_chat_messages
            WHERE conversation_id = c.id AND author_role = 'USER'
            ORDER BY created_at DESC, id DESC
            LIMIT 1
          ) AS question
        FROM support_conversations c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
      `,
      [reply.conversation_id],
    );
    const row = context.rows[0];
    if (!row) return false;

    await emailService.sendSupportReply({
      to: row.notify_email || row.email,
      fullName: row.full_name,
      question: row.question ?? "",
      reply: reply.body,
    });
    return true;
  } catch (error) {
    logger?.warn({ err: error }, "Không gửi được email phản hồi hỗ trợ.");
    return false;
  }
}
