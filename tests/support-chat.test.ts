import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import {
  listSupportChatMessages,
  receiveSlackReply,
  sendSupportChatMessage,
} from "../src/services/support-chat.js";
import type { Database } from "../src/db.js";

let db: Database;
let close: () => Promise<void>;
let userId: string;

function slackEnabledConfig() {
  return {
    ...testConfig(),
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_SUPPORT_CHANNEL: "C0TEST",
  };
}

/** Giả lập Slack API: mọi chat.postMessage thành công, ts tăng dần. */
function mockSlackOk() {
  let counter = 0;
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<
        string,
        unknown
      >;
      calls.push(payload);
      counter += 1;
      return {
        json: async () => ({
          ok: true,
          ts: `1700000000.00000${counter}`,
          channel: "C0TEST",
        }),
      };
    }),
  );
  return calls;
}

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  const user = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('khach@shoptik.vn', 'Khach Hang', 'ACTIVE', 'USER', 'CHATREF01')
     RETURNING id`,
  );
  userId = user.rows[0]!.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await close();
});

describe("sendSupportChatMessage", () => {
  it("lưu tin của người dùng và tạo thread Slack ở tin đầu tiên", async () => {
    const calls = mockSlackOk();
    const message = await sendSupportChatMessage(db, slackEnabledConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Đơn của mình chưa thấy tiền hoàn.",
    });
    expect(message.authorRole).toBe("USER");

    // Cuộc gọi 1: tin gốc tạo thread; cuộc gọi 2: nội dung tin trong thread.
    expect(calls).toHaveLength(2);
    const rootText = String(calls[0]!.text);
    expect(rootText).toContain("Khach Hang");
    expect(rootText).toContain("khach@shoptik.vn");
    expect(rootText).toContain("Số đơn");
    expect(rootText).toContain("/backoffice/accounts/");
    expect(calls[1]!.thread_ts).toBe("1700000000.000001");

    const conversation = await db.query<{
      slack_channel_id: string;
      slack_thread_ts: string;
    }>(`SELECT slack_channel_id, slack_thread_ts FROM support_conversations`);
    expect(conversation.rows[0]).toEqual({
      slack_channel_id: "C0TEST",
      slack_thread_ts: "1700000000.000001",
    });
  });

  it("tin thứ hai dùng lại thread cũ, không tạo thread mới", async () => {
    const calls = mockSlackOk();
    const config = slackEnabledConfig();
    await sendSupportChatMessage(db, config, {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Tin thứ nhất đủ dài.",
    });
    await sendSupportChatMessage(db, config, {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Tin thứ hai đủ dài.",
    });
    // 2 (root + tin 1) + 1 (tin 2 vào thread cũ) = 3 cuộc gọi.
    expect(calls).toHaveLength(3);
    expect(calls[2]!.thread_ts).toBe("1700000000.000001");
  });

  it("Slack lỗi thì tin vẫn được lưu vào DB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ ok: false, error: "channel_not_found" }),
      })),
    );
    await sendSupportChatMessage(db, slackEnabledConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Tin này vẫn phải được lưu.",
    });
    const messages = await listSupportChatMessages(db, userId);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.body).toBe("Tin này vẫn phải được lưu.");
  });

  it("tắt tích hợp Slack thì không gọi mạng nhưng vẫn lưu tin", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await sendSupportChatMessage(db, testConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Không có Slack vẫn chat được.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await listSupportChatMessages(db, userId)).toHaveLength(1);
  });
});

describe("receiveSlackReply", () => {
  async function seedConversationWithThread(): Promise<void> {
    mockSlackOk();
    await sendSupportChatMessage(db, slackEnabledConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Câu hỏi mở thread.",
    });
  }

  it("lưu câu trả lời của nhân viên vào đúng hội thoại", async () => {
    await seedConversationWithThread();
    const stored = await receiveSlackReply(db, {
      type: "message",
      user: "U0AGENT",
      text: "Chào bạn, mình kiểm tra ngay nhé.",
      channel: "C0TEST",
      ts: "1700000000.000099",
      thread_ts: "1700000000.000001",
    });
    expect(stored).toBe(true);
    const messages = await listSupportChatMessages(db, userId);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      authorRole: "AGENT",
      body: "Chào bạn, mình kiểm tra ngay nhé.",
    });
  });

  it("khử trùng lặp khi Slack gửi lại cùng một sự kiện", async () => {
    await seedConversationWithThread();
    const event = {
      type: "message",
      user: "U0AGENT",
      text: "Trả lời một lần.",
      channel: "C0TEST",
      ts: "1700000000.000099",
      thread_ts: "1700000000.000001",
    };
    expect(await receiveSlackReply(db, event)).toBe(true);
    expect(await receiveSlackReply(db, event)).toBe(false);
    expect(await listSupportChatMessages(db, userId)).toHaveLength(2);
  });

  it("bỏ qua tin của bot, tin ngoài thread và thread lạ", async () => {
    await seedConversationWithThread();
    // Tin do bot gửi (chính là echo của bot này).
    expect(
      await receiveSlackReply(db, {
        type: "message",
        bot_id: "B0BOT",
        text: "echo",
        channel: "C0TEST",
        ts: "1",
        thread_ts: "1700000000.000001",
      }),
    ).toBe(false);
    // Tin nhắn thẳng vào kênh, không nằm trong thread nào.
    expect(
      await receiveSlackReply(db, {
        type: "message",
        user: "U0AGENT",
        text: "tin ngoài thread",
        channel: "C0TEST",
        ts: "2",
      }),
    ).toBe(false);
    // Thread không khớp hội thoại nào.
    expect(
      await receiveSlackReply(db, {
        type: "message",
        user: "U0AGENT",
        text: "thread lạ",
        channel: "C0TEST",
        ts: "3",
        thread_ts: "9999999999.000000",
      }),
    ).toBe(false);
    expect(await listSupportChatMessages(db, userId)).toHaveLength(1);
  });
});
