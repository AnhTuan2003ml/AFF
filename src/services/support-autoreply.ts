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
import { loadUserPolicyFacts, buildUserPolicy } from "./user-policy.js";
import { buildTerms } from "./legal-docs.js";

// Tự trả lời chat hỗ trợ: CANNED (tin mẫu) hoặc AI (OpenAI/Anthropic/Gemini
// với system prompt + RAG). Chạy nền sau khi tin của khách đã lưu; lỗi chỉ
// ghi log, không bao giờ chặn luồng chat.

// Chỉ 2 chế độ: MANUAL (nhân viên tự trả lời) và AUTO (ưu tiên kho đã học,
// chưa có mẫu thì gọi AI rồi lưu lại).
export type AutoReplyMode = "MANUAL" | "AUTO";
export type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "custom";

interface ProviderMeta {
  label: string;
  suggestedModels: string[];
  /** Base URL mặc định cho API kiểu OpenAI (chat/completions). */
  defaultBaseUrl?: string;
  /** true = bắt buộc người dùng dán link API (base URL). */
  needsBaseUrl?: boolean;
}

export const AI_PROVIDERS: Record<AiProvider, ProviderMeta> = {
  openai: {
    label: "OpenAI (ChatGPT)",
    suggestedModels: ["gpt-5", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"],
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    suggestedModels: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  gemini: {
    // Model bậc MIỄN PHÍ (Google AI Studio API key). Ưu tiên alias "*-latest" vì
    // luôn trỏ model mới nhất, KHÔNG bị "no longer available" như bản đánh số.
    // Chỉ là gợi ý — ô Model cho gõ/dán bất kỳ tên nào; xem danh sách mới nhất ở
    // https://ai.google.dev/models.
    label: "Google (Gemini)",
    suggestedModels: [
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
    ],
  },
  deepseek: {
    label: "DeepSeek",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    defaultBaseUrl: "https://api.deepseek.com/v1",
  },
  custom: {
    label: "Tùy chỉnh (API tương thích OpenAI)",
    suggestedModels: [],
    needsBaseUrl: true,
  },
};

const AI_TIMEOUT_MS = 30000;
const HISTORY_LIMIT = 12;
const KB_MAX_DOCS = 3;
const KB_MAX_CHARS = 6000;
// Nhân viên thật vừa trả lời trong khoảng này thì AI không chen vào.
const HUMAN_ACTIVE_WINDOW_MINUTES = 10;
const CANNED_COOLDOWN_HOURS = 24;

// Mẫu câu chào mặc định của Camio theo giới tính ({ten} = tên gọi của khách).
// Khớp DEFAULT ở migration 054; dùng khi chưa có row cấu hình.
export const DEFAULT_CAMIO_GREETINGS = {
  male: "Camio chào anh {ten} 🧡 Anh muốn hỏi về chính sách hoàn tiền, điều khoản hay cách ShopTik hoạt động không ạ?",
  female:
    "Camio chào chị {ten} 🧡 Chị muốn hỏi về chính sách hoàn tiền, điều khoản hay cách ShopTik hoạt động không ạ?",
  unknown:
    "Camio chào anh/chị {ten} 🧡 Anh/chị muốn hỏi về chính sách hoàn tiền, điều khoản hay cách ShopTik hoạt động không ạ?",
} as const;

export interface AutoReplySettings {
  mode: AutoReplyMode;
  cannedMessage: string;
  aiProvider: AiProvider;
  aiModel: string;
  aiBaseUrl: string;
  aiSystemPrompt: string;
  hasApiKey: boolean;
  learnEnabled: boolean;
  similarityThreshold: number;
  camioGreetingMale: string;
  camioGreetingFemale: string;
  camioGreetingUnknown: string;
}

interface SettingsRow {
  mode: AutoReplyMode;
  canned_message: string;
  ai_provider: AiProvider;
  ai_api_key_ciphertext: string;
  ai_model: string;
  ai_base_url: string;
  ai_system_prompt: string;
  learn_enabled: boolean;
  similarity_threshold: number;
  camio_greeting_male: string;
  camio_greeting_female: string;
  camio_greeting_unknown: string;
}

async function loadSettingsRow(db: Database): Promise<SettingsRow | null> {
  const result = await query<SettingsRow>(
    db,
    `
      SELECT mode, canned_message, ai_provider, ai_api_key_ciphertext,
        ai_model, ai_base_url, ai_system_prompt, learn_enabled,
        similarity_threshold, camio_greeting_male, camio_greeting_female,
        camio_greeting_unknown
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
      mode: "MANUAL",
      cannedMessage: "",
      aiProvider: "openai",
      aiModel: "",
      aiBaseUrl: "",
      aiSystemPrompt: "",
      hasApiKey: false,
      learnEnabled: true,
      similarityThreshold: 82,
      camioGreetingMale: DEFAULT_CAMIO_GREETINGS.male,
      camioGreetingFemale: DEFAULT_CAMIO_GREETINGS.female,
      camioGreetingUnknown: DEFAULT_CAMIO_GREETINGS.unknown,
    };
  }
  return {
    mode: row.mode,
    cannedMessage: row.canned_message,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    aiBaseUrl: row.ai_base_url,
    aiSystemPrompt: row.ai_system_prompt,
    hasApiKey: Boolean(row.ai_api_key_ciphertext),
    learnEnabled: row.learn_enabled,
    similarityThreshold: row.similarity_threshold,
    camioGreetingMale: row.camio_greeting_male || DEFAULT_CAMIO_GREETINGS.male,
    camioGreetingFemale:
      row.camio_greeting_female || DEFAULT_CAMIO_GREETINGS.female,
    camioGreetingUnknown:
      row.camio_greeting_unknown || DEFAULT_CAMIO_GREETINGS.unknown,
  };
}

export async function saveAutoReplySettings(
  db: Database,
  config: AppConfig,
  input: {
    mode: AutoReplyMode;
    cannedMessage?: string;
    aiProvider: AiProvider;
    aiModel: string;
    aiBaseUrl?: string;
    aiSystemPrompt: string;
    /** Trống = giữ key đã lưu. */
    aiApiKey: string;
    learnEnabled?: boolean;
    similarityThreshold?: number;
    camioGreetingMale?: string;
    camioGreetingFemale?: string;
    camioGreetingUnknown?: string;
  },
): Promise<void> {
  const existing = await loadSettingsRow(db);
  const baseUrl = (input.aiBaseUrl ?? "").trim();
  if (input.mode === "AUTO") {
    if (!input.aiModel.trim()) {
      throw new AppError("AI_MODEL_REQUIRED", "Hãy chọn tên model AI.", 400);
    }
    if (!input.aiApiKey.trim() && !existing?.ai_api_key_ciphertext) {
      throw new AppError(
        "AI_KEY_REQUIRED",
        "Hãy dán API key của nhà cung cấp đã chọn.",
        400,
      );
    }
    if (AI_PROVIDERS[input.aiProvider]?.needsBaseUrl && !baseUrl) {
      throw new AppError(
        "AI_BASE_URL_REQUIRED",
        "Nhà cung cấp Tùy chỉnh cần link API (base URL).",
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
        ai_model, ai_base_url, ai_system_prompt, learn_enabled,
        similarity_threshold, camio_greeting_male, camio_greeting_female,
        camio_greeting_unknown, updated_at
      ) VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      ON CONFLICT (id) DO UPDATE SET
        mode = EXCLUDED.mode,
        canned_message = EXCLUDED.canned_message,
        ai_provider = EXCLUDED.ai_provider,
        ai_api_key_ciphertext = EXCLUDED.ai_api_key_ciphertext,
        ai_model = EXCLUDED.ai_model,
        ai_base_url = EXCLUDED.ai_base_url,
        ai_system_prompt = EXCLUDED.ai_system_prompt,
        learn_enabled = EXCLUDED.learn_enabled,
        similarity_threshold = EXCLUDED.similarity_threshold,
        camio_greeting_male = EXCLUDED.camio_greeting_male,
        camio_greeting_female = EXCLUDED.camio_greeting_female,
        camio_greeting_unknown = EXCLUDED.camio_greeting_unknown,
        updated_at = now()
    `,
    [
      input.mode,
      (input.cannedMessage ?? "").trim(),
      input.aiProvider,
      keyCiphertext,
      input.aiModel.trim(),
      baseUrl,
      input.aiSystemPrompt.trim(),
      input.learnEnabled ?? true,
      Math.min(100, Math.max(50, Math.round(input.similarityThreshold ?? 82))),
      (input.camioGreetingMale ?? DEFAULT_CAMIO_GREETINGS.male).trim() ||
        DEFAULT_CAMIO_GREETINGS.male,
      (input.camioGreetingFemale ?? DEFAULT_CAMIO_GREETINGS.female).trim() ||
        DEFAULT_CAMIO_GREETINGS.female,
      (input.camioGreetingUnknown ?? DEFAULT_CAMIO_GREETINGS.unknown).trim() ||
        DEFAULT_CAMIO_GREETINGS.unknown,
    ],
  );
}

/** Tên gọi để chào: từ CUỐI của họ tên (kiểu Việt) — "Phạm Anh Tuấn" → "Tuấn". */
export function firstNameForGreeting(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : "";
}

/**
 * Dựng lời chào Camio theo giới tính + tên, từ mẫu câu cấu hình. {ten} được
 * thay bằng tên gọi; nếu trống thì bỏ khoảng trắng thừa cho câu vẫn gọn.
 */
export function buildCamioGreeting(
  settings: Pick<
    AutoReplySettings,
    "camioGreetingMale" | "camioGreetingFemale" | "camioGreetingUnknown"
  >,
  user: { fullName?: string | null; gender?: string | null } | null,
): string {
  const gender = user?.gender ?? "UNKNOWN";
  const template =
    gender === "MALE"
      ? settings.camioGreetingMale
      : gender === "FEMALE"
        ? settings.camioGreetingFemale
        : settings.camioGreetingUnknown;
  const name = firstNameForGreeting(user?.fullName);
  return template
    .replace(/\{ten\}/g, name)
    .replace(/\s+([,.!?…])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
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

/* ---------- Tự học Q&A: RAG động, gặp câu tương tự thì khỏi gọi AI ---------- */

export interface LearnedAnswer {
  id: string;
  question: string;
  answer: string;
  hits: number;
  updated_at: Date;
}

/** Chuẩn hóa câu hỏi về MỘT dạng: viết thường, bỏ dấu câu, gộp khoảng trắng. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Độ tương đồng cosine trên tập token (0..1). */
function tokenCosine(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  return inter / Math.sqrt(setA.size * setB.size);
}

/**
 * Tìm câu trả lời đã học cho câu hỏi TƯƠNG TỰ (≥ ngưỡng %). Khớp chính xác
 * (bản chuẩn hóa) trước, rồi so token cosine với kho gần đây.
 */
export async function findSimilarLearnedAnswer(
  db: Database,
  question: string,
  thresholdPercent: number,
): Promise<{ id: string; answer: string; score: number } | null> {
  const norm = normalizeQuestion(question);
  if (!norm) return null;
  const exact = await query<{ id: string; answer: string }>(
    db,
    `SELECT id, answer FROM support_learned_answers WHERE question_norm = $1 LIMIT 1`,
    [norm],
  );
  if (exact.rows[0]) return { ...exact.rows[0], score: 100 };

  const qTokens = tokenize(question);
  if (!qTokens.length) return null;
  const rows = await query<{ id: string; answer: string; tokens: string[] }>(
    db,
    `SELECT id, answer, tokens FROM support_learned_answers
     ORDER BY updated_at DESC LIMIT 1000`,
  );
  const threshold = thresholdPercent / 100;
  let best: { id: string; answer: string; score: number } | null = null;
  for (const row of rows.rows) {
    const score = tokenCosine(qTokens, row.tokens ?? []);
    if (score >= threshold && (best === null || score * 100 > best.score)) {
      best = { id: row.id, answer: row.answer, score: Math.round(score * 100) };
    }
  }
  return best;
}

/** Lưu/cập nhật cặp câu hỏi (chuẩn hóa) → câu trả lời để tái dùng. */
export async function learnAnswer(
  db: Database,
  question: string,
  answer: string,
): Promise<void> {
  const norm = normalizeQuestion(question);
  if (!norm || !answer.trim()) return;
  await query(
    db,
    `INSERT INTO support_learned_answers (question, question_norm, tokens, answer)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (question_norm) DO UPDATE SET
       answer = EXCLUDED.answer, tokens = EXCLUDED.tokens,
       question = EXCLUDED.question, updated_at = now()`,
    [question.slice(0, 2000), norm, tokenize(question), answer.slice(0, 3000)],
  );
}

export async function recordLearnedHit(db: Database, id: string): Promise<void> {
  await query(
    db,
    `UPDATE support_learned_answers SET hits = hits + 1 WHERE id = $1`,
    [id],
  );
}

export async function listLearnedAnswers(
  db: Database,
  limit = 100,
): Promise<LearnedAnswer[]> {
  const r = await query<LearnedAnswer>(
    db,
    `SELECT id, question, answer, hits, updated_at FROM support_learned_answers
     ORDER BY hits DESC, updated_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows;
}

export async function countLearnedAnswers(db: Database): Promise<number> {
  const r = await query<{ n: string }>(
    db,
    `SELECT count(*)::text AS n FROM support_learned_answers`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function deleteLearnedAnswer(
  db: Database,
  id: string,
): Promise<boolean> {
  const r = await query(
    db,
    `DELETE FROM support_learned_answers WHERE id = $1`,
    [id],
  );
  return Boolean(r.rowCount);
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

/** Gọi API kiểu OpenAI (chat/completions) — dùng cho OpenAI, DeepSeek và mọi
 *  endpoint tương thích (provider Tùy chỉnh). baseUrl không có đuôi "/". */
async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatHistoryEntry[],
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetch(url, {
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
    throw new Error(`AI: ${data.error?.message ?? response.status}`);
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
    case "deepseek":
    case "custom": {
      const baseUrl =
        settings.ai_provider === "custom"
          ? settings.ai_base_url
          : (AI_PROVIDERS[settings.ai_provider].defaultBaseUrl ?? "");
      return callOpenAiCompatible(
        baseUrl,
        apiKey,
        settings.ai_model,
        systemPrompt,
        history,
      );
    }
    case "anthropic":
      return callAnthropic(apiKey, settings.ai_model, systemPrompt, history);
    case "gemini":
      return callGemini(apiKey, settings.ai_model, systemPrompt, history);
  }
}

/* ------------------------------------------------------------------ *
 * Kiểm tra kết nối AI (nút "Kiểm tra kết nối" ở backoffice)
 * Gọi một request tối thiểu tới provider để xác nhận key + model chạy được,
 * đồng thời đọc header rate-limit (usage/limit) nếu provider trả về.
 * ------------------------------------------------------------------ */

const AI_TEST_TIMEOUT_MS = 15000;

export interface AiTestResult {
  ok: boolean;
  message: string;
  /** Các dòng hạn mức/usage đọc từ header (nếu có). */
  limits?: { label: string; value: string }[];
}

function readOpenAiLimits(headers: Headers): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const reqLimit = headers.get("x-ratelimit-limit-requests");
  const reqRemain = headers.get("x-ratelimit-remaining-requests");
  const tokLimit = headers.get("x-ratelimit-limit-tokens");
  const tokRemain = headers.get("x-ratelimit-remaining-tokens");
  if (reqLimit) {
    out.push({ label: "Requests còn lại", value: `${reqRemain ?? "?"} / ${reqLimit}` });
  }
  if (tokLimit) {
    out.push({ label: "Tokens còn lại", value: `${tokRemain ?? "?"} / ${tokLimit}` });
  }
  return out;
}

async function testOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<AiTestResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    }),
    signal: AbortSignal.timeout(AI_TEST_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    return { ok: false, message: data.error?.message ?? `HTTP ${response.status}` };
  }
  return {
    ok: true,
    message: `Kết nối OK — model "${model}" phản hồi bình thường.`,
    limits: readOpenAiLimits(response.headers),
  };
}

async function testAnthropic(apiKey: string, model: string): Promise<AiTestResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal: AbortSignal.timeout(AI_TEST_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    return { ok: false, message: data.error?.message ?? `HTTP ${response.status}` };
  }
  const h = response.headers;
  const limits: { label: string; value: string }[] = [];
  const reqLimit = h.get("anthropic-ratelimit-requests-limit");
  const reqRemain = h.get("anthropic-ratelimit-requests-remaining");
  const tokLimit = h.get("anthropic-ratelimit-tokens-limit");
  const tokRemain = h.get("anthropic-ratelimit-tokens-remaining");
  if (reqLimit) {
    limits.push({ label: "Requests còn lại", value: `${reqRemain ?? "?"} / ${reqLimit}` });
  }
  if (tokLimit) {
    limits.push({ label: "Tokens còn lại", value: `${tokRemain ?? "?"} / ${tokLimit}` });
  }
  return {
    ok: true,
    message: `Kết nối OK — model "${model}" phản hồi bình thường.`,
    limits,
  };
}

async function testGemini(apiKey: string, model: string): Promise<AiTestResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
      signal: AbortSignal.timeout(AI_TEST_TIMEOUT_MS),
    },
  );
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    return { ok: false, message: data.error?.message ?? `HTTP ${response.status}` };
  }
  // Gemini không trả header rate-limit; xem hạn mức ở Google AI Studio.
  return {
    ok: true,
    message: `Kết nối OK — model "${model}" phản hồi bình thường. (Gemini không trả hạn mức qua API; xem ở Google AI Studio.)`,
  };
}

/** Kiểm tra key + model. Key trống thì dùng key đã lưu (giải mã). */
export async function testAiConnection(
  db: Database,
  config: AppConfig,
  input: { provider: AiProvider; model: string; baseUrl: string; apiKey: string },
): Promise<AiTestResult> {
  const model = input.model.trim();
  if (!model) {
    return { ok: false, message: "Hãy chọn/nhập tên model trước khi kiểm tra." };
  }
  const existing = await loadSettingsRow(db);
  const apiKey = input.apiKey.trim()
    ? input.apiKey.trim()
    : existing?.ai_api_key_ciphertext
      ? decryptField(existing.ai_api_key_ciphertext, config)
      : "";
  if (!apiKey) {
    return { ok: false, message: "Chưa có API key. Hãy dán key rồi kiểm tra lại." };
  }
  try {
    switch (input.provider) {
      case "openai":
      case "deepseek":
      case "custom": {
        const baseUrl =
          input.provider === "custom"
            ? input.baseUrl.trim()
            : (AI_PROVIDERS[input.provider].defaultBaseUrl ?? "");
        if (input.provider === "custom" && !baseUrl) {
          return { ok: false, message: "Nhà cung cấp Tùy chỉnh cần link API (base URL)." };
        }
        return await testOpenAiCompatible(baseUrl, apiKey, model);
      }
      case "anthropic":
        return await testAnthropic(apiKey, model);
      case "gemini":
        return await testGemini(apiKey, model);
    }
  } catch (error) {
    const msg =
      error instanceof Error
        ? error.name === "TimeoutError"
          ? "Hết thời gian chờ (15s) — kiểm tra base URL/mạng."
          : error.message
        : "Lỗi không xác định.";
    return { ok: false, message: msg };
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
    // Chỉ tự trả lời ở chế độ AUTO. MANUAL = nhân viên tự xử lý.
    if (!settings || settings.mode !== "AUTO") return false;

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

    // Tự học: gặp câu HỎI tương tự đã trả lời trước đó → trả lời NGAY, khỏi
    // gọi AI (nhanh + tiết kiệm chi phí).
    if (settings.learn_enabled) {
      const learned = await findSimilarLearnedAnswer(
        db,
        question,
        settings.similarity_threshold,
      );
      if (learned) {
        await insertAutoMessage(
          db,
          config,
          input.conversationId,
          learned.answer,
          input.logger,
        );
        await recordLearnedHit(db, learned.id);
        return true;
      }
    }

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
    // Lưu cặp Q&A vừa sinh làm "tài liệu RAG động" cho lần sau.
    if (settings.learn_enabled) {
      await learnAnswer(db, question, reply).catch(() => undefined);
    }
    return true;
  } catch (error) {
    input.logger?.warn({ err: error }, "Tự trả lời hỗ trợ thất bại.");
    return false;
  }
}

/* ─────────────────────────── Trợ lý Camio (AI) ─────────────────────────── */

const CAMIO_SYSTEM_PROMPT =
  "Bạn là Camio — trợ lý ảo của ShopTik, nền tảng hoàn tiền mua sắm qua " +
  "Shopee/TikTok Shop/Lazada. Xưng 'Camio' (hoặc 'em'), gọi khách là 'anh/chị'. " +
  "Thân thiện, ngắn gọn, chính xác. Ở giai đoạn này bạn CHỈ trả lời về CHÍNH SÁCH " +
  "và ĐIỀU KHOẢN của hệ thống dựa trên tài liệu tham khảo bên dưới. Nếu câu hỏi " +
  "nằm ngoài phạm vi tài liệu, hoặc cần can thiệp tài khoản/đơn hàng/số dư cụ thể, " +
  "hãy nói rõ và mời khách bấm 'Chat với CSKH' để nhân viên xử lý.";

// Khi khách đã chọn một đơn (bấm "Tìm đơn"): được phép trả lời về ĐÚNG đơn đó
// dựa trên "Thông tin đơn hàng của khách" trong tài liệu tham khảo.
const CAMIO_SYSTEM_PROMPT_ORDER =
  "Bạn là Camio — trợ lý ảo của ShopTik, nền tảng hoàn tiền mua sắm qua " +
  "Shopee/TikTok Shop/Lazada. Xưng 'Camio' (hoặc 'em'), gọi khách là 'anh/chị'. " +
  "Thân thiện, ngắn gọn, chính xác. Khách đang hỏi về MỘT đơn hoặc MỘT sản phẩm " +
  "cụ thể — thông tin đó và các chính sách liên quan nằm trong tài liệu tham khảo " +
  "bên dưới. Hãy trả lời dựa CHÍNH XÁC vào thông tin đã cho (trạng thái, tiền hoàn/" +
  "tiền hoàn dự kiến, thời gian về ví, lý do hủy…) kèm chính sách tương ứng. TUYỆT " +
  "ĐỐI không bịa số liệu ngoài thông tin đã cho. Không hứa thay đổi số dư/duyệt đơn " +
  "— nếu khách cần can thiệp tài khoản hoặc thông tin không đủ, mời khách bấm " +
  "'Chat với CSKH'.";

/** Dựng tài liệu RAG từ Chính sách người dùng + Điều khoản sử dụng (theo mục). */
async function buildPolicyTermsKb(
  db: Database,
  config: AppConfig,
): Promise<KbDocument[]> {
  const facts = await loadUserPolicyFacts(db, config);
  const now = new Date();
  const docs: KbDocument[] = [];
  for (const source of [buildUserPolicy(facts), buildTerms(facts)]) {
    for (const section of source.sections) {
      docs.push({
        id: `${source.title}:${section.id}`,
        title: `${source.title} — ${section.heading}`,
        content: [...section.paragraphs, ...section.items].join("\n"),
        created_at: now,
      });
    }
  }
  return docs;
}

/**
 * Sinh câu trả lời của trợ lý Camio (AI) cho một câu hỏi — RAG trên Chính sách/
 * Điều khoản + tài liệu KB của admin. Tiết kiệm token: câu tương tự đã học trả
 * lời ngay không gọi AI; RAG chỉ nạp 3 mục liên quan nhất vào prompt. Trả null
 * nếu chưa cấu hình AI (FE sẽ hiện thông báo hướng dẫn).
 */
/** Cách xưng hô với khách theo giới tính (Camio gọi khách là gì). */
export function xungHoTheoGioiTinh(gender: string | null | undefined): string {
  if (gender === "MALE") return "anh";
  if (gender === "FEMALE") return "chị";
  return "anh/chị";
}

export async function generateCamioReply(
  db: Database,
  config: AppConfig,
  input: {
    question: string;
    history: ChatHistoryEntry[];
    /** Ngữ cảnh MỘT đơn khách đang hỏi (đã kiểm tra sở hữu ở tầng route). */
    orderContext?: string | null;
    /** Khách hàng — để Camio xưng hô đúng tên + giới tính trong câu trả lời. */
    user?: {
      fullName?: string | null | undefined;
      gender?: string | null | undefined;
    } | null;
  },
): Promise<string | null> {
  const settings = await loadSettingsRow(db);
  if (!settings || !settings.ai_api_key_ciphertext || !settings.ai_model) {
    return null;
  }
  const orderContext = (input.orderContext ?? "").trim();
  const hasOrder = orderContext.length > 0;

  // Xưng hô cá nhân hoá: tên gọi + anh/chị theo giới tính. Chỉ coi là "đã cá
  // nhân hoá" khi biết tên HOẶC giới tính rõ ràng — vì câu trả lời khi đó chứa
  // dữ liệu riêng của khách, KHÔNG được tự học để trả cho người khác.
  const ten = firstNameForGreeting(input.user?.fullName);
  const xung = xungHoTheoGioiTinh(input.user?.gender);
  const personalized =
    ten.length > 0 ||
    input.user?.gender === "MALE" ||
    input.user?.gender === "FEMALE";
  const skipLearn = hasOrder || personalized;

  // Tự học chỉ áp cho câu hỏi CHUNG (chính sách/điều khoản), chưa cá nhân hoá.
  if (settings.learn_enabled && !skipLearn) {
    const learned = await findSimilarLearnedAnswer(
      db,
      input.question,
      settings.similarity_threshold,
    );
    if (learned) {
      await recordLearnedHit(db, learned.id).catch(() => undefined);
      return learned.answer;
    }
  }
  const kbDocs = [
    ...(await buildPolicyTermsKb(db, config)),
    ...(await listKbDocuments(db)),
  ];
  let kbContext = buildKbContext(rankKbDocuments(kbDocs, input.question));
  if (hasOrder) {
    kbContext =
      "Thông tin đơn hàng của khách (chỉ trả lời về đơn này, không suy diễn thêm):\n" +
      `${orderContext}\n\n${kbContext}`;
  }
  const apiKey = decryptField(settings.ai_api_key_ciphertext, config);
  const basePrompt = hasOrder
    ? CAMIO_SYSTEM_PROMPT_ORDER
    : CAMIO_SYSTEM_PROMPT;
  // Ép Camio xưng hô đúng, và KHÔNG chào/tự giới thiệu lại ở mỗi câu trả lời
  // (đã có lời chào ở đầu hội thoại rồi).
  const xungHoLine = [
    `Cách xưng hô BẮT BUỘC: gọi khách là "${xung}${ten ? ` ${ten}` : ""}" (hoặc "${xung}"), tự xưng "em"/"Camio".`,
    xung !== "anh/chị"
      ? `Tuyệt đối KHÔNG dùng "anh/chị" — đã biết khách là "${xung}".`
      : "",
    `KHÔNG chào hỏi hay tự giới thiệu lại ("Chào ...", "em là Camio đây ạ", "em xin ...") ở đầu mỗi câu trả lời — lời chào đã có ở đầu hội thoại. Hãy trả lời THẲNG vào câu hỏi.`,
  ]
    .filter(Boolean)
    .join(" ");
  const camioSettings: SettingsRow = {
    ...settings,
    ai_system_prompt: `${basePrompt}\n\n${xungHoLine}`,
  };
  const reply = await generateAiReply(
    camioSettings,
    apiKey,
    input.history,
    kbContext,
  );
  if (reply && settings.learn_enabled && !skipLearn) {
    await learnAnswer(db, input.question, reply).catch(() => undefined);
  }
  return reply || null;
}
