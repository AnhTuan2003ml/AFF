import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";

// Slack Web API cho chat hỗ trợ. Lỗi gọi Slack chỉ ghi log cảnh báo,
// không được làm hỏng thao tác của người dùng.

const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";
const SLACK_DELETE_MESSAGE_URL = "https://slack.com/api/chat.delete";
const SLACK_TIMEOUT_MS = 8000;
// Chặn replay theo khuyến nghị của Slack.
const SIGNATURE_MAX_AGE_SECONDS = 300;

export interface SlackLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface SlackPostResult {
  ok: boolean;
  ts: string;
  channel: string;
  /**
   * true khi thread đích không còn tồn tại (tin gốc bị xóa trên Slack).
   * Lưu ý: Slack có thể vẫn trả ok và đăng tin RA NGOÀI kênh thay vì báo
   * lỗi — trường hợp đó `ok` vẫn true kèm `threadBroken` true.
   */
  threadBroken: boolean;
}

export function isSlackSupportEnabled(config: AppConfig): boolean {
  return Boolean(config.SLACK_BOT_TOKEN && config.SLACK_SUPPORT_CHANNEL);
}

export function escapeSlackText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Gửi tin vào kênh CSKH; không ném lỗi — thất bại trả `ok: false`. */
export async function postSupportMessage(
  config: AppConfig,
  text: string,
  options: {
    threadTs?: string;
    channel?: string;
    logger?: SlackLogger | undefined;
  } = {},
): Promise<SlackPostResult> {
  const failed: SlackPostResult = {
    ok: false,
    ts: "",
    channel: "",
    threadBroken: false,
  };
  if (!isSlackSupportEnabled(config)) return failed;
  try {
    const response = await fetch(SLACK_POST_MESSAGE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.SLACK_BOT_TOKEN}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: options.channel || config.SLACK_SUPPORT_CHANNEL,
        text,
        ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      ts?: string;
      channel?: string;
      message?: { thread_ts?: string };
    };
    if (!data.ok) {
      options.logger?.warn(
        { slackError: data.error ?? `HTTP ${response.status}` },
        "Gửi tin nhắn hỗ trợ sang Slack thất bại.",
      );
      return {
        ...failed,
        threadBroken:
          data.error === "thread_not_found" ||
          data.error === "message_not_found",
      };
    }
    // Thread gốc bị xóa: Slack vẫn trả ok nhưng đăng tin ra ngoài kênh
    // (message.thread_ts trống) — coi như thread đã chết để bên gọi tự chữa.
    const threadBroken = Boolean(
      options.threadTs &&
        data.message !== undefined &&
        data.message.thread_ts !== options.threadTs,
    );
    return {
      ok: true,
      ts: data.ts ?? "",
      channel: data.channel ?? "",
      threadBroken,
    };
  } catch (error) {
    options.logger?.warn({ err: error }, "Không gọi được Slack API.");
    return failed;
  }
}

/** Xóa một tin nhắn do bot đăng (dọn tin lạc thread) — best effort. */
export async function deleteSlackMessage(
  config: AppConfig,
  channel: string,
  ts: string,
  logger?: SlackLogger,
): Promise<void> {
  if (!isSlackSupportEnabled(config) || !channel || !ts) return;
  try {
    const response = await fetch(SLACK_DELETE_MESSAGE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.SLACK_BOT_TOKEN}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel, ts }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });
    const data = (await response.json()) as { ok?: boolean; error?: string };
    if (!data.ok) {
      logger?.warn(
        { slackError: data.error ?? `HTTP ${response.status}` },
        "Không xóa được tin nhắn Slack.",
      );
    }
  } catch (error) {
    logger?.warn({ err: error }, "Không gọi được Slack API (chat.delete).");
  }
}

/** v0=HMAC_SHA256(secret, "v0:<timestamp>:<raw body>"), kèm chặn replay. */
export function verifySlackSignature(input: {
  signingSecret: string;
  rawBody: string;
  timestamp: string;
  signature: string;
  nowSeconds?: number;
}): boolean {
  const { signingSecret, rawBody, timestamp, signature } = input;
  if (!signingSecret || !timestamp || !signature) return false;
  const requestSeconds = Number(timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(requestSeconds) ||
    Math.abs(nowSeconds - requestSeconds) > SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }
  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}
