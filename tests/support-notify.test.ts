import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import { sendSupportChatMessage } from "../src/services/support-chat.js";
import { notifySupportReplyByEmail } from "../src/services/support-notify.js";
import type { EmailService } from "../src/services/email.js";
import type { Database } from "../src/db.js";

// Email báo phản hồi CSKH: nhắc lại vấn đề của khách + nội dung trả lời,
// gửi về notify_email (điền trong form) hoặc email đăng ký.

let db: Database;
let close: () => Promise<void>;
let userId: string;
let conversationId: string;

function emailMock() {
  const sendSupportReply = vi.fn(async (_params: unknown) => {});
  return {
    service: { sendSupportReply } as unknown as EmailService,
    sendSupportReply,
  };
}

async function insertAgentReply(
  body: string,
  slackTs: string,
  createdAt?: string,
): Promise<void> {
  await db.query(
    `
      INSERT INTO support_chat_messages
        (conversation_id, author_role, body, slack_ts, created_at)
      VALUES ($1, 'AGENT', $2, $3, COALESCE($4::timestamptz, now()))
    `,
    [conversationId, body, slackTs, createdAt ?? null],
  );
}

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  const user = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('khach@shoptik.vn', 'Khach Hang', 'ACTIVE', 'USER', 'NOTIREF01')
     RETURNING id`,
  );
  userId = user.rows[0]!.id;
  // Tạo hội thoại + câu hỏi của khách (Slack tắt trong testConfig).
  await sendSupportChatMessage(db, testConfig(), {
    userId,
    userEmail: "khach@shoptik.vn",
    body: "Đơn của mình sao chưa thấy tiền hoàn?",
  });
  const conversation = await db.query<{ id: string }>(
    `SELECT id FROM support_conversations WHERE user_id = $1`,
    [userId],
  );
  conversationId = conversation.rows[0]!.id;
});

afterEach(async () => {
  await close();
});

describe("notifySupportReplyByEmail", () => {
  it("gửi email kèm vấn đề của khách và phản hồi, về email đăng ký khi chưa điền", async () => {
    await insertAgentReply("Bên mình đã kiểm tra, đơn sẽ duyệt trong 24h.", "1700.1");
    const { service, sendSupportReply } = emailMock();
    const sent = await notifySupportReplyByEmail(db, service, {
      type: "message",
      ts: "1700.1",
    });
    expect(sent).toBe(true);
    expect(sendSupportReply).toHaveBeenCalledWith({
      to: "khach@shoptik.vn",
      fullName: "Khach Hang",
      question: "Đơn của mình sao chưa thấy tiền hoàn?",
      reply: "Bên mình đã kiểm tra, đơn sẽ duyệt trong 24h.",
    });
  });

  it("ưu tiên notify_email đã điền trong form", async () => {
    await db.query(
      `UPDATE support_conversations SET notify_email = 'nhan@rieng.vn' WHERE id = $1`,
      [conversationId],
    );
    await insertAgentReply("Phản hồi về email riêng.", "1700.2");
    const { service, sendSupportReply } = emailMock();
    expect(
      await notifySupportReplyByEmail(db, service, { type: "message", ts: "1700.2" }),
    ).toBe(true);
    expect(sendSupportReply.mock.calls[0]![0]).toMatchObject({
      to: "nhan@rieng.vn",
    });
  });

  it("nhân viên nhắn liên tiếp thì chỉ email cho tin đầu", async () => {
    await insertAgentReply("Tin đầu.", "1700.3");
    await insertAgentReply("Tin nối tiếp ngay sau.", "1700.4");
    const { service, sendSupportReply } = emailMock();
    expect(
      await notifySupportReplyByEmail(db, service, { type: "message", ts: "1700.4" }),
    ).toBe(false);
    expect(sendSupportReply).not.toHaveBeenCalled();
  });

  it("khoảng lặng đủ lâu thì tin mới lại được email", async () => {
    await insertAgentReply(
      "Tin cũ hơn 10 phút.",
      "1700.5",
      "2026-01-01T00:00:00Z",
    );
    await insertAgentReply("Tin mới sau khoảng lặng.", "1700.6");
    const { service, sendSupportReply } = emailMock();
    expect(
      await notifySupportReplyByEmail(db, service, { type: "message", ts: "1700.6" }),
    ).toBe(true);
    expect(sendSupportReply).toHaveBeenCalledTimes(1);
  });

  it("không email khi sự kiện không khớp tin AGENT nào", async () => {
    const { service, sendSupportReply } = emailMock();
    expect(
      await notifySupportReplyByEmail(db, service, { type: "message", ts: "9999.9" }),
    ).toBe(false);
    expect(sendSupportReply).not.toHaveBeenCalled();
  });
});
