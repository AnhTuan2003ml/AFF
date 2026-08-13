import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import {
  buildKbContext,
  getAutoReplySettings,
  listKbDocuments,
  maybeAutoReply,
  rankKbDocuments,
  saveAutoReplySettings,
  addKbDocument,
} from "../src/services/support-autoreply.js";
import {
  listSupportChatMessages,
  sendSupportChatMessage,
} from "../src/services/support-chat.js";
import type { Database } from "../src/db.js";

let db: Database;
let close: () => Promise<void>;
let userId: string;
let conversationId: string;

const config = testConfig(); // Slack tắt trong test — không gọi mạng cho Slack.

async function seedConversation(): Promise<void> {
  await sendSupportChatMessage(db, config, {
    userId,
    userEmail: "khach@shoptik.vn",
    body: "Khi nào tiền hoàn về ví khả dụng vậy shop?",
  });
  const row = await db.query<{ id: string }>(
    `SELECT id FROM support_conversations WHERE user_id = $1`,
    [userId],
  );
  conversationId = row.rows[0]!.id;
}

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  const user = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ('khach@shoptik.vn', 'Khach Hang', 'ACTIVE', 'USER', 'ARREF0001')
     RETURNING id`,
  );
  userId = user.rows[0]!.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await close();
});

describe("saveAutoReplySettings / getAutoReplySettings", () => {
  it("lưu cấu hình, mã hóa API key và không trả key ra ngoài", async () => {
    await saveAutoReplySettings(db, config, {
      mode: "AI",
      cannedMessage: "",
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5",
      aiSystemPrompt: "Bạn là CSKH ShopTik.",
      aiApiKey: "sk-ant-test-123",
    });
    const settings = await getAutoReplySettings(db);
    expect(settings).toMatchObject({
      mode: "AI",
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5",
      hasApiKey: true,
    });
    // Key phải được mã hóa trong DB, không nằm ở dạng thuần.
    const raw = await db.query<{ ai_api_key_ciphertext: string }>(
      `SELECT ai_api_key_ciphertext FROM support_autoreply_settings`,
    );
    expect(raw.rows[0]!.ai_api_key_ciphertext).not.toContain("sk-ant-test-123");
    expect(raw.rows[0]!.ai_api_key_ciphertext.startsWith("v1.")).toBe(true);
  });

  it("để trống API key khi cập nhật thì giữ key cũ", async () => {
    await saveAutoReplySettings(db, config, {
      mode: "AI",
      cannedMessage: "",
      aiProvider: "openai",
      aiModel: "gpt-5-mini",
      aiSystemPrompt: "",
      aiApiKey: "sk-old",
    });
    await saveAutoReplySettings(db, config, {
      mode: "AI",
      cannedMessage: "",
      aiProvider: "openai",
      aiModel: "gpt-5",
      aiSystemPrompt: "",
      aiApiKey: "",
    });
    const settings = await getAutoReplySettings(db);
    expect(settings.aiModel).toBe("gpt-5");
    expect(settings.hasApiKey).toBe(true);
  });

  it("bật AI mà chưa từng có key thì báo lỗi", async () => {
    await expect(
      saveAutoReplySettings(db, config, {
        mode: "AI",
        cannedMessage: "",
        aiProvider: "gemini",
        aiModel: "gemini-2.5-flash",
        aiSystemPrompt: "",
        aiApiKey: "",
      }),
    ).rejects.toMatchObject({ code: "AI_KEY_REQUIRED" });
  });
});

describe("rankKbDocuments / buildKbContext", () => {
  const documents = [
    {
      id: "1",
      title: "Chính sách hoàn tiền",
      content: "Tiền hoàn về ví chờ, sau thời gian giữ sẽ sang ví khả dụng.",
      created_at: new Date(),
    },
    {
      id: "2",
      title: "Hướng dẫn rút tiền",
      content: "Rút tiền tối thiểu 50.000đ về tài khoản ngân hàng đã xác minh.",
      created_at: new Date(),
    },
    {
      id: "3",
      title: "Liên kết TikTok",
      content: "Cách gắn link TikTok Shop để nhận hoa hồng.",
      created_at: new Date(),
    },
  ];

  it("xếp tài liệu trùng từ khóa lên đầu, bỏ tài liệu không liên quan", () => {
    const ranked = rankKbDocuments(documents, "bao giờ tiền hoàn về ví khả dụng?");
    expect(ranked[0]!.id).toBe("1");
    expect(ranked.map((d) => d.id)).not.toContain("3");
  });

  it("ghép ngữ cảnh kèm tiêu đề tài liệu", () => {
    const context = buildKbContext([documents[0]!]);
    expect(context).toContain("### Chính sách hoàn tiền");
    expect(context).toContain("ví khả dụng");
  });
});

describe("maybeAutoReply — CANNED", () => {
  it("gửi tin mẫu một lần, không lặp lại trong 24h", async () => {
    await seedConversation();
    await saveAutoReplySettings(db, config, {
      mode: "CANNED",
      cannedMessage: "Đã nhận tin nhắn, CSKH sẽ phản hồi sớm!",
      aiProvider: "openai",
      aiModel: "",
      aiSystemPrompt: "",
      aiApiKey: "",
    });
    expect(await maybeAutoReply(db, config, { conversationId })).toBe(true);
    expect(await maybeAutoReply(db, config, { conversationId })).toBe(false);
    const messages = await listSupportChatMessages(db, userId);
    const agentMessages = messages.filter((m) => m.authorRole === "AGENT");
    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0]!.body).toContain("Đã nhận tin nhắn");
  });
});

describe("maybeAutoReply — AI", () => {
  async function enableAi(): Promise<void> {
    await saveAutoReplySettings(db, config, {
      mode: "AI",
      cannedMessage: "",
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5",
      aiSystemPrompt: "Bạn là CSKH ShopTik.",
      aiApiKey: "sk-ant-test",
    });
    await addKbDocument(db, {
      title: "Chính sách hoàn tiền",
      content: "Tiền hoàn giữ 30 ngày rồi chuyển sang ví khả dụng.",
    });
  }

  it("gọi provider với system prompt + RAG và lưu câu trả lời is_auto", async () => {
    await seedConversation();
    await enableAi();
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: { body?: string }) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? "{}")),
        });
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: "Tiền hoàn giữ 30 ngày ạ." }],
            stop_reason: "end_turn",
          }),
        };
      }),
    );

    expect(await maybeAutoReply(db, config, { conversationId })).toBe(true);

    expect(calls[0]!.url).toContain("api.anthropic.com");
    const system = String(calls[0]!.body.system);
    expect(system).toContain("Bạn là CSKH ShopTik.");
    expect(system).toContain("Chính sách hoàn tiền"); // RAG được đưa vào ngữ cảnh
    expect(calls[0]!.body.model).toBe("claude-haiku-4-5");

    const raw = await db.query<{ body: string; is_auto: boolean }>(
      `SELECT body, is_auto FROM support_chat_messages
       WHERE author_role = 'AGENT' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(raw.rows[0]).toEqual({
      body: "Tiền hoàn giữ 30 ngày ạ.",
      is_auto: true,
    });
  });

  it("không chen khi nhân viên thật vừa trả lời", async () => {
    await seedConversation();
    await enableAi();
    await db.query(
      `INSERT INTO support_chat_messages (conversation_id, author_role, body, is_auto)
       VALUES ($1, 'AGENT', 'Mình đang kiểm tra cho bạn nhé', false)`,
      [conversationId],
    );
    // Tin mới của khách sau khi nhân viên trả lời.
    await db.query(
      `INSERT INTO support_chat_messages (conversation_id, author_role, body)
       VALUES ($1, 'USER', 'Dạ vâng em chờ ạ')`,
      [conversationId],
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await maybeAutoReply(db, config, { conversationId })).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("provider lỗi thì im lặng, không ghi tin nào", async () => {
    await seedConversation();
    await enableAi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "invalid api key" } }),
      })),
    );
    expect(await maybeAutoReply(db, config, { conversationId })).toBe(false);
    const messages = await listSupportChatMessages(db, userId);
    expect(messages.filter((m) => m.authorRole === "AGENT")).toHaveLength(0);
  });
});

describe("kb documents", () => {
  it("thêm và liệt kê tài liệu", async () => {
    await addKbDocument(db, { title: "FAQ", content: "Nội dung đủ dài đây." });
    const documents = await listKbDocuments(db);
    expect(documents).toHaveLength(1);
    expect(documents[0]!.title).toBe("FAQ");
  });
});
