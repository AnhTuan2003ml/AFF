import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";

interface WebhookRouteDeps {
  config: AppConfig;
}

/**
 * Webhook nhận Message Push của Lazada Open Platform.
 *
 * TÁCH BIỆT với OAuth: /auth/lazada/callback là GET đổi authorization code;
 * còn Lazada "Verify" ở màn hình cấu hình push sẽ POST vào URL này và chỉ cần
 * HTTP 200 trả lời nhanh. Route vì thế:
 *   - nhận POST mọi content-type (JSON/form/rỗng), body giới hạn 256KB;
 *   - luôn trả 200 {"code":"0"} thật nhanh (chuẩn ack của nền tảng TOP);
 *   - KHÔNG thực hiện nghiệp vụ nào từ payload (chưa xác thực chữ ký push —
 *     Lazada chưa công bố rõ lược đồ ký cho app này), chỉ log metadata không
 *     nhạy cảm để đối chiếu; khi nào dùng dữ liệu thật sẽ thêm bước xác thực.
 */
export async function registerWebhookRoutes(
  app: FastifyInstance,
  _deps: WebhookRouteDeps,
): Promise<void> {
  await app.register(async (scoped) => {
    // Nhận nguyên văn mọi content-type trong scope này — Verify của Lazada có
    // thể POST JSON hoặc form; parser mặc định sẽ 415/400 làm Verify FAIL.
    scoped.addContentTypeParser(
      "*",
      { parseAs: "string", bodyLimit: 256 * 1024 },
      (_request, payload, done) => done(null, payload),
    );

    const ack = { code: "0" };

    scoped.post(
      "/webhooks/lazada",
      {
        config: { csrf: false, rateLimit: { max: 600, timeWindow: "1 minute" } },
      },
      async (request, reply) => {
        const raw = typeof request.body === "string" ? request.body : "";
        // Log metadata đủ đối chiếu, không log nguyên văn (có thể chứa dữ liệu
        // người mua) và không bao giờ log secret/token.
        let messageType: unknown = null;
        let sellerId: unknown = null;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          messageType = parsed.message_type ?? parsed.type ?? null;
          sellerId = parsed.seller_id ?? null;
        } catch {
          // Verify có thể gửi body rỗng/không phải JSON — vẫn ack bình thường.
        }
        request.log.info(
          { bytes: raw.length, messageType, sellerId },
          "Lazada webhook nhận push",
        );
        return reply.code(200).send(ack);
      },
    );

    // Một số bộ kiểm tra probe GET trước khi Verify — trả 200 cho chắc.
    scoped.get("/webhooks/lazada", async (_request, reply) =>
      reply.code(200).send(ack),
    );
  });
}
