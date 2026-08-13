import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { verifySlackSignature } from "../services/slack.js";
import {
  receiveSlackReply,
  type SlackMessageEvent,
} from "../services/support-chat.js";

interface SlackEventRouteDeps {
  db: Database;
  config: AppConfig;
}

// Webhook Slack Events API: nhân viên trả lời trong thread → lưu vào hội
// thoại của đúng người dùng. Xác thực bằng chữ ký trên raw body (không CSRF),
// nên plugin tự đăng ký parser giữ nguyên chuỗi JSON gốc trong scope này.
export async function registerSlackEventRoutes(
  app: FastifyInstance,
  deps: SlackEventRouteDeps,
): Promise<void> {
  await app.register(async (scoped) => {
    scoped.addContentTypeParser(
      "application/json",
      { parseAs: "string", bodyLimit: 256 * 1024 },
      (request, payload, done) => {
        (request as { rawBody?: string }).rawBody = payload as string;
        try {
          done(null, JSON.parse(payload as string));
        } catch {
          done(new Error("JSON không hợp lệ."), undefined);
        }
      },
    );

    scoped.post(
      "/api/slack/events",
      { config: { csrf: false } },
      async (request, reply) => {
        if (!deps.config.SLACK_SIGNING_SECRET) {
          return reply.code(503).send({ error: "slack_disabled" });
        }
        const rawBody = (request as { rawBody?: string }).rawBody ?? "";
        const verified = verifySlackSignature({
          signingSecret: deps.config.SLACK_SIGNING_SECRET,
          rawBody,
          timestamp: String(
            request.headers["x-slack-request-timestamp"] ?? "",
          ),
          signature: String(request.headers["x-slack-signature"] ?? ""),
        });
        if (!verified) {
          request.log.warn("Từ chối sự kiện Slack: chữ ký không hợp lệ.");
          return reply.code(401).send({ error: "invalid_signature" });
        }

        const payload = request.body as {
          type?: string;
          challenge?: string;
          event?: SlackMessageEvent;
        };

        if (payload.type === "url_verification") {
          return reply.send({ challenge: payload.challenge ?? "" });
        }

        if (payload.type === "event_callback" && payload.event) {
          try {
            await receiveSlackReply(deps.db, payload.event);
          } catch (error) {
            // Trả 200 để Slack không retry vô hạn.
            request.log.error({ err: error }, "Lỗi xử lý sự kiện Slack.");
          }
        }
        return reply.send({ ok: true });
      },
    );
  });
}
