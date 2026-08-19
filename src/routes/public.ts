import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database, withTransaction } from "../db.js";
import { hashSensitiveValue } from "../lib/crypto.js";
import {
  isPlatformPurchaseEnabled,
  isSafeAffiliateRedirect,
} from "../services/affiliate.js";
import {
  buildUserPolicy,
  loadUserPolicyFacts,
} from "../services/user-policy.js";

interface PublicRouteDeps {
  db: Database;
  config: AppConfig;
}

export async function registerPublicRoutes(
  app: FastifyInstance,
  deps: PublicRouteDeps,
): Promise<void> {
  // Ai cũng vào thẳng giao diện chính (/app). Khách có thể dán link kiểm tra
  // hoàn tiền; chỉ khi Mua/xem ví... mới bị đẩy sang đăng nhập.
  app.get("/", async (_request, reply) => reply.redirect("/app"));

  app.get("/favicon.ico", { config: { csrf: false } }, (_request, reply) =>
    reply.redirect("/assets/images/icon.png"),
  );

  app.get("/dieu-khoan", async (_request, reply) =>
    reply.view("legal/terms.njk", {
      pageTitle: "Điều khoản sử dụng",
      policyVersion: deps.config.TERMS_VERSION,
    }),
  );

  app.get("/quyen-rieng-tu", async (_request, reply) =>
    reply.view("legal/privacy.njk", {
      pageTitle: "Chính sách quyền riêng tư",
      policyVersion: deps.config.PRIVACY_VERSION,
    }),
  );

  app.get("/chinh-sach-nguoi-dung", async (_request, reply) => {
    const policy = buildUserPolicy(
      await loadUserPolicyFacts(deps.db, deps.config),
    );
    return reply.view("legal/user-policy.njk", {
      pageTitle: policy.title,
      policy,
    });
  });

  // Mảnh HTML cho modal đọc nhanh mở từ hyperlink ở chân trang (không layout).
  app.get("/chinh-sach-nguoi-dung/noi-dung", async (_request, reply) => {
    const policy = buildUserPolicy(
      await loadUserPolicyFacts(deps.db, deps.config),
    );
    return reply
      .type("text/html; charset=utf-8")
      .view("legal/user-policy-body.njk", { policy });
  });

  app.get<{
    Params: { clickId: string };
  }>("/go/:clickId", async (request, reply) => {
    const result = await query<{
      id: string;
      platform: "SHOPEE" | "TIKTOK" | "LAZADA";
      affiliate_url: string;
      status: string;
      expires_at: Date | null;
    }>(
      deps.db,
      `
        SELECT id, platform, affiliate_url, status, expires_at
        FROM affiliate_links
        WHERE click_id = $1
        LIMIT 1
      `,
      [request.params.clickId],
    );
    const link = result.rows[0];
    if (
      !link ||
      link.status !== "ACTIVE" ||
      (link.expires_at && link.expires_at.getTime() <= Date.now())
    ) {
      return reply.code(404).view("error.njk", {
        pageTitle: "Link không còn hiệu lực",
        statusCode: 404,
        message:
          "Đường dẫn mua không tồn tại hoặc đã hết hạn. Hãy tìm lại sản phẩm để mua.",
      });
    }
    if (
      !isSafeAffiliateRedirect(
        link.affiliate_url,
        link.platform,
        deps.config,
      )
    ) {
      request.log.error(
        { affiliateLinkId: link.id },
        "Chặn redirect Affiliate không đúng allowlist",
      );
      return reply.code(503).view("error.njk", {
        pageTitle: "Link đang được kiểm tra",
        statusCode: 503,
        message:
          "Đường dẫn đích không vượt qua kiểm tra an toàn. Vui lòng tìm lại sản phẩm hoặc liên hệ hỗ trợ.",
      });
    }

    const userAgent = String(request.headers["user-agent"] ?? "");
    const botFlag = /bot|crawler|spider|preview/i.test(userAgent);
    const referrerHost = (() => {
      const value = request.headers.referer;
      if (!value) return null;
      try {
        return new URL(value).hostname.slice(0, 255);
      } catch {
        return null;
      }
    })();

    await withTransaction(deps.db, async (client) => {
      await query(
        client,
        `
          INSERT INTO click_events (
            affiliate_link_id, ip_hash, user_agent_hash, referrer_host, bot_flag
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [
          link.id,
          hashSensitiveValue(request.ip, deps.config),
          hashSensitiveValue(userAgent, deps.config),
          referrerHost,
          botFlag,
        ],
      );
      await query(
        client,
        "UPDATE affiliate_links SET click_count = click_count + 1 WHERE id = $1",
        [link.id],
      );
    });
    return reply.code(302).redirect(link.affiliate_url);
  });

  app.get("/-/live", { config: { csrf: false } }, async () => ({
    status: "ok",
  }));
  app.get("/-/ready", { config: { csrf: false } }, async (_request, reply) => {
    await query(deps.db, "SELECT 1");
    return reply.send({ status: "ready" });
  });
}
