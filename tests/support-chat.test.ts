import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import {
  listSupportChatMessages,
  receiveSlackReply,
  sendSupportChatMessage,
  warnOffThreadAgentMessage,
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

describe("thread Slack bị xóa", () => {
  /**
   * Giả lập thread cũ đã chết: post vào thread 1700000000.000001 thì Slack
   * vẫn trả ok nhưng tin rơi ra ngoài kênh (message.thread_ts trống) — đúng
   * hành vi thật của Slack khi tin gốc thread bị xóa.
   */
  function mockSlackDeadThread() {
    let counter = 0;
    const calls: Array<{ url: string; payload: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        const payload = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        calls.push({ url: String(url), payload });
        if (String(url).includes("chat.delete")) {
          return { json: async () => ({ ok: true }) };
        }
        counter += 1;
        const ts = `1800000000.00000${counter}`;
        const requested = payload.thread_ts as string | undefined;
        const dead = requested === "1700000000.000001";
        return {
          json: async () => ({
            ok: true,
            ts,
            channel: "C0TEST",
            message: dead || !requested ? {} : { thread_ts: requested },
          }),
        };
      }),
    );
    return calls;
  }

  it("tự mở thread mới, dọn tin lạc và gửi lại tin của khách", async () => {
    const config = slackEnabledConfig();
    mockSlackOk();
    await sendSupportChatMessage(db, config, {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Tin đầu mở thread cũ.",
    });

    // Thread 1700000000.000001 giờ đã bị xóa trên Slack.
    const calls = mockSlackDeadThread();
    await sendSupportChatMessage(db, config, {
      userId,
      userEmail: "khach@shoptik.vn",
      body: "Tin thứ hai sau khi thread bị xóa.",
    });

    // 1: post vào thread chết (rơi ra ngoài kênh) → 2: xóa tin lạc
    // → 3: đăng tin gốc thread mới → 4: gửi lại tin vào thread mới.
    expect(calls).toHaveLength(4);
    expect(calls[0]!.payload.thread_ts).toBe("1700000000.000001");
    expect(calls[1]!.url).toContain("chat.delete");
    expect(calls[1]!.payload.ts).toBe("1800000000.000001");
    expect(String(calls[2]!.payload.text)).toContain("Hội thoại hỗ trợ mới");
    expect(calls[2]!.payload.thread_ts).toBeUndefined();
    expect(calls[3]!.payload.thread_ts).toBe("1800000000.000002");
    expect(String(calls[3]!.payload.text)).toContain("Tin thứ hai");

    const conversation = await db.query<{ slack_thread_ts: string }>(
      `SELECT slack_thread_ts FROM support_conversations`,
    );
    expect(conversation.rows[0]!.slack_thread_ts).toBe("1800000000.000002");
    // Tin của khách vẫn nằm đủ trong DB dù Slack trục trặc.
    expect(await listSupportChatMessages(db, userId)).toHaveLength(2);
  });
});

describe("warnOffThreadAgentMessage", () => {
  it("nhắc nhân viên khi trả lời ngoài thread trong kênh CSKH", async () => {
    const calls = mockSlackOk();
    await warnOffThreadAgentMessage(slackEnabledConfig(), {
      type: "message",
      user: "U0AGENT",
      text: "ok",
      channel: "C0TEST",
      ts: "1700000000.000200",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.thread_ts).toBe("1700000000.000200");
    expect(String(calls[0]!.text)).toContain("KHÔNG được gửi tới khách hàng");
  });

  it("nhắc cả khi trả lời trong thread không thuộc khách nào", async () => {
    const calls = mockSlackOk();
    await warnOffThreadAgentMessage(slackEnabledConfig(), {
      type: "message",
      user: "U0AGENT",
      text: "trong thread lạ",
      channel: "C0TEST",
      ts: "1700000000.000301",
      thread_ts: "1700000000.000300",
    });
    expect(calls).toHaveLength(1);
    // Nhắc ngay trong chính thread đó để nhân viên nhìn thấy.
    expect(calls[0]!.thread_ts).toBe("1700000000.000300");
  });

  it("bỏ qua bot và kênh khác", async () => {
    const calls = mockSlackOk();
    const config = slackEnabledConfig();
    await warnOffThreadAgentMessage(config, {
      type: "message",
      bot_id: "B0BOT",
      text: "echo",
      channel: "C0TEST",
      ts: "1",
    });
    await warnOffThreadAgentMessage(config, {
      type: "message",
      user: "U0AGENT",
      text: "kênh khác",
      channel: "C0KHAC",
      ts: "3",
    });
    expect(calls).toHaveLength(0);
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
    expect(stored).toBe("STORED");
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
    expect(await receiveSlackReply(db, event)).toBe("STORED");
    expect(await receiveSlackReply(db, event)).toBe("DUPLICATE");
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
    ).toBe("IGNORED");
    // Tin nhắn thẳng vào kênh, không nằm trong thread nào.
    expect(
      await receiveSlackReply(db, {
        type: "message",
        user: "U0AGENT",
        text: "tin ngoài thread",
        channel: "C0TEST",
        ts: "2",
      }),
    ).toBe("UNMATCHED");
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
    ).toBe("UNMATCHED");
    expect(await listSupportChatMessages(db, userId)).toHaveLength(1);
  });

  it("định tuyến trả lời nằm dưới tin của khách bị văng ra ngoài kênh", async () => {
    await seedConversationWithThread();
    // mockSlackOk: cuộc gọi 2 là tin của khách, ts = 1700000000.000002 —
    // đã được lưu vào slack_ts của tin đó. CSKH trả lời trong thread của
    // chính tin này (không phải thread gốc của hội thoại).
    expect(
      await receiveSlackReply(db, {
        type: "message",
        user: "U0AGENT",
        text: "Trả lời dưới tin mồ côi.",
        channel: "C0TEST",
        ts: "1700000000.000300",
        thread_ts: "1700000000.000002",
      }),
    ).toBe("STORED");
    const messages = await listSupportChatMessages(db, userId);
    expect(messages[messages.length - 1]).toMatchObject({
      authorRole: "AGENT",
      body: "Trả lời dưới tin mồ côi.",
    });
  });
});
