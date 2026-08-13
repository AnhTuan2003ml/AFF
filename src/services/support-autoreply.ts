import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { decryptField, encryptField } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import {
  escapeSlackText,
  isSlackSupportEnabled,
  postSupportMessage,
  type SlackLogger,
} from "./slack.js";

// Tự trả lời chat hỗ trợ: CANNED (tin mẫu) hoặc AI (OpenAI/Anthropic/Gemini
// với system prompt + RAG). Chạy nền sau khi tin của khách đã lưu; lỗi chỉ
// ghi log, không bao giờ chặn luồng chat.

export type AutoReplyMode = "OFF" | "CANNED" | "AI";
export type AiProvider = "openai" | "anthropic" | "gemini";

export const AI_PROVIDERS: Record<
  AiProvider,
  { label: string; suggestedModels: string[] }
> = {
  openai: {
    label: "OpenAI (ChatGPT)",
    suggestedModels: ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"],
  },
  anthropic: {
    label: "Anthropic (Claude)",
    suggestedModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  gemini: {
    label: "Google (Gemini)",
    suggestedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
  },
};

const AI_TIMEOUT_MS = 30000;
const HISTORY_LIMIT = 12;
const KB_MAX_DOCS = 3;
const KB_MAX_CHARS = 6000;
// Nhân viên thật vừa trả lời trong khoảng này thì AI không chen vào.
const HUMAN_ACTIVE_WINDOW_MINUTES = 10;
const CANNED_COOLDOWN_HOURS = 24;

export interface AutoReplySettings {
  mode: AutoReplyMode;
  cannedMessage: string;
  aiProvider: AiProvider;
  aiModel: string;
  aiSystemPrompt: string;
  hasApiKey: boolean;
}

interface SettingsRow {
  mode: AutoReplyMode;
  canned_message: string;
  ai_provider: AiProvider;
  ai_api_key_ciphertext: string;
  ai_model: string;
  ai_system_prompt: string;
}

async function loadSettingsRow(db: Database): Promise<SettingsRow | null> {
  const result = await query<SettingsRow>(
    db,
    `
      SELECT mode, canned_message, ai_provider, ai_api_key_ciphertext,
        ai_model, ai_system_prompt
      FROM support_autoreply_settings WHERE id = true
    `,
  );
  return result.rows[0] ?? null;
}

export async function getAutoReplySettings(
  db: Database,
): Promise<AutoReplySettings> {
  const row = await loadSettingsRow(db);
  if (!row) {
    return {
      mode: "OFF",
      cannedMessage: "",
      aiProvider: "openai",
      aiModel: "",
      aiSystemPrompt: "",
      hasApiKey: false,
    };
  }
  return {
    mode: row.mode,
    cannedMessage: row.canned_message,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    aiSystemPrompt: row.ai_system_prompt,
    hasApiKey: Boolean(row.ai_api_key_ciphertext),
  };
}

export async function saveAutoReplySettings(
  db: Database,
  config: AppConfig,
  input: {
    mode: AutoReplyMode;
    cannedMessage: string;
    aiProvider: AiProvider;
    aiModel: string;
    aiSystemPrompt: string;
    /** Trống = giữ key đã lưu. */
    aiApiKey: string;
  },
): Promise<void> {
  if (input.mode === "CANNED" && !input.cannedMessage.trim()) {
    throw new AppError(
      "CANNED_MESSAGE_REQUIRED",
      "Chế độ trả lời mẫu cần nội dung tin nhắn.",
      400,
    );
  }
  const existing = await loadSettingsRow(db);
  if (input.mode === "AI") {
    if (!input.aiModel.trim()) {
      throw new AppError("AI_MODEL_REQUIRED", "Hãy chọn model AI.", 400);
    }
    if (!input.aiApiKey.trim() && !existing?.ai_api_key_ciphertext) {
      throw new AppError(
        "AI_KEY_REQUIRED",
        "Hãy dán API key của provider đã chọn.",
        400,
      );
    }
  }
  const keyCiphertext = input.aiApiKey.trim()
    ? encryptField(input.aiApiKey.trim(), config)
    : (existing?.ai_api_key_ciphertext ?? "");
  await query(
    db,
    `
      INSERT INTO support_autoreply_settings (
        id, mode, canned_message, ai_provider, ai_api_key_ciphertext,
        ai_model, ai_system_prompt, updated_at
      ) VALUES (true, $1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (id) DO UPDATE SET
        mode = EXCLUDED.mode,
        canned_message = EXCLUDED.canned_message,
        ai_provider = EXCLUDED.ai_provider,
        ai_api_key_ciphertext = EXCLUDED.ai_api_key_ciphertext,
        ai_model = EXCLUDED.ai_model,
        ai_system_prompt = EXCLUDED.ai_system_prompt,
        updated_at = now()
    `,
    [
      input.mode,
      input.cannedMessage.trim(),
      input.aiProvider,
      keyCiphertext,
      input.aiModel.trim(),
      input.aiSystemPrompt.trim(),
    ],
  );
}

export interface KbDocument {
  id: string;
  title: string;
  content: string;
  created_at: Date;
}

export async function listKbDocuments(db: Database): Promise<KbDocument[]> {
  const result = await query<KbDocument>(
    db,
    `SELECT id, title, content, created_at FROM support_kb_documents
     ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function addKbDocument(
  db: Database,
  input: { title: string; content: string },
): Promise<void> {
  await query(
    db,
    `INSERT INTO support_kb_documents (title, content) VALUES ($1, $2)`,
    [input.title.trim(), input.content.trim()],
  );
}

export async function deleteKbDocument(
  db: Database,
  id: string,
): Promise<boolean> {
  const result = await query(
    db,
    `DELETE FROM support_kb_documents WHERE id = $1`,
    [id],
  );
  return Boolean(result.rowCount);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}

// RAG khớp từ khóa (không embedding): trùng tiêu đề x3, trùng nội dung x1.
export function rankKbDocuments(
  documents: KbDocument[],
  question: string,
  maxDocs = KB_MAX_DOCS,
): KbDocument[] {
  const keywords = new Set(tokenize(question));
  if (!keywords.size) return [];
  const scored = documents
    .map((doc) => {
      const titleTokens = new Set(tokenize(doc.title));
      const contentTokens = new Set(tokenize(doc.content));
      let score = 0;
      for (const keyword of keywords) {
        if (titleTokens.has(keyword)) score += 3;
        if (contentTokens.has(keyword)) score += 1;
      }
      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, maxDocs).map((entry) => entry.doc);
}

export function buildKbContext(documents: KbDocument[]): string {
  if (!documents.length) return "";
  let remaining = KB_MAX_CHARS;
  const parts: string[] = [];
  for (const doc of documents) {
    if (remaining <= 0) break;
    const body = doc.content.slice(0, Math.max(0, remaining));
    parts.push(`### ${doc.title}\n${body}`);
    remaining -= body.length;
  }
  return parts.join("\n\n");
}

export interface ChatHistoryEntry {
  authorRole: "USER" | "AGENT";
  body: string;
}

function buildSystemPrompt(settings: SettingsRow, kbContext: string): string {
  const parts = [
    settings.ai_system_prompt ||
      "Bạn là nhân viên chăm sóc khách hàng của một nền tảng hoàn tiền mua sắm.",
    [
      "Quy tắc bắt buộc:",
      "- Trả lời bằng tiếng Việt, ngắn gọn, lịch sự.",
      "- Chỉ dùng thông tin trong tài liệu tham khảo và hội thoại; TUYỆT ĐỐI không bịa số tiền, chính sách hay thời hạn.",
      "- Không hứa hẹn thay đổi số dư, duyệt đơn hay hoàn tiền — việc đó do nhân viên thật xử lý.",
      "- Nếu không chắc chắn hoặc vấn đề cần can thiệp tài khoản, nói rõ rằng bạn đã ghi nhận và nhân viên sẽ phản hồi sớm.",
    ].join("\n"),
  ];
  if (kbContext) {
    parts.push(`Tài liệu tham khảo nội bộ:\n${kbContext}`);
  }
  return parts.join("\n\n");
}

async function callOpenAi(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((entry) => ({
          role: entry.authorRole === "USER" ? "user" : "assistant",
          content: entry.body,
        })),
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(`OpenAI: ${data.error?.message ?? response.status}`);
  }
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: history.map((entry) => ({
        role: entry.authorRole === "USER" ? "user" : "assistant",
        content: entry.body,
      })),
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });
  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(`Anthropic: ${data.error?.message ?? response.status}`);
  }
  if (data.stop_reason === "refusal") return "";
  return (
    data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("") ?? ""
  ).trim();
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: history.map((entry) => ({
          role: entry.authorRole === "USER" ? "user" : "model",
          parts: [{ text: entry.body }],
        })),
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    },
  );
  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(`Gemini: ${data.error?.message ?? response.status}`);
  }
  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  ).trim();
}

async function generateAiReply(
  settings: SettingsRow,
  apiKey: string,
  history: ChatHistoryEntry[],
  kbContext: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(settings, kbContext);
  switch (settings.ai_provider) {
    case "openai":
      return callOpenAi(apiKey, settings.ai_model, systemPrompt, history);
    case "anthropic":
      return callAnthropic(apiKey, settings.ai_model, systemPrompt, history);
    case "gemini":
      return callGemini(apiKey, settings.ai_model, systemPrompt, history);
  }
}

async function insertAutoMessage(
  db: Database,
  config: AppConfig,
  conversationId: string,
  body: string,
  logger?: SlackLogger,
): Promise<void> {
  await query(
    db,
    `
      INSERT INTO support_chat_messages (conversation_id, author_role, body, is_auto)
      VALUES ($1, 'AGENT', $2, true)
    `,
    [conversationId, body.slice(0, 3000)],
  );
  await query(
    db,
    `UPDATE support_conversations SET updated_at = now() WHERE id = $1`,
    [conversationId],
  );
  if (isSlackSupportEnabled(config)) {
    const conversation = await query<{
      slack_channel_id: string;
      slack_thread_ts: string;
    }>(
      db,
      `SELECT slack_channel_id, slack_thread_ts FROM support_conversations WHERE id = $1`,
      [conversationId],
    );
    const row = conversation.rows[0];
    if (row?.slack_thread_ts) {
      await postSupportMessage(
        config,
        `:robot_face: *Tự động trả lời:* ${escapeSlackText(body)}`,
        {
          channel: row.slack_channel_id,
          threadTs: row.slack_thread_ts,
          logger,
        },
      );
    }
  }
}

/** Gọi sau khi tin của khách đã lưu. Không bao giờ ném lỗi. */
export async function maybeAutoReply(
  db: Database,
  config: AppConfig,
  input: { conversationId: string; logger?: SlackLogger },
): Promise<boolean> {
  try {
    const settings = await loadSettingsRow(db);
    if (!settings || settings.mode === "OFF") return false;

    if (settings.mode === "CANNED") {
      if (!settings.canned_message) return false;
      const recentAgent = await query(
        db,
        `
          SELECT 1 FROM support_chat_messages
          WHERE conversation_id = $1 AND author_role = 'AGENT'
            AND created_at > now() - interval '${CANNED_COOLDOWN_HOURS} hours'
          LIMIT 1
        `,
        [input.conversationId],
      );
      if (recentAgent.rows.length) return false;
      await insertAutoMessage(
        db,
        config,
        input.conversationId,
        settings.canned_message,
        input.logger,
      );
      return true;
    }

    if (!settings.ai_api_key_ciphertext || !settings.ai_model) return false;
    const recentHuman = await query(
      db,
      `
        SELECT 1 FROM support_chat_messages
        WHERE conversation_id = $1 AND author_role = 'AGENT'
          AND is_auto = false
          AND created_at > now() - interval '${HUMAN_ACTIVE_WINDOW_MINUTES} minutes'
        LIMIT 1
      `,
      [input.conversationId],
    );
    if (recentHuman.rows.length) return false;

    const historyResult = await query<{
      author_role: "USER" | "AGENT";
      body: string;
    }>(
      db,
      `
        SELECT author_role, body FROM support_chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [input.conversationId, HISTORY_LIMIT],
    );
    const history: ChatHistoryEntry[] = historyResult.rows
      .reverse()
      .map((row) => ({ authorRole: row.author_role, body: row.body }));
    if (!history.length || history[history.length - 1]!.authorRole !== "USER") {
      return false;
    }

    const question = history[history.length - 1]!.body;
    const kbContext = buildKbContext(
      rankKbDocuments(await listKbDocuments(db), question),
    );
    const apiKey = decryptField(settings.ai_api_key_ciphertext, config);
    const reply = await generateAiReply(settings, apiKey, history, kbContext);
    if (!reply) return false;

    await insertAutoMessage(
      db,
      config,
      input.conversationId,
      reply,
      input.logger,
    );
    return true;
  } catch (error) {
    input.logger?.warn({ err: error }, "Tự trả lời hỗ trợ thất bại.");
    return false;
  }
}
