import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { randomToken, safeStringEqual } from "../lib/crypto.js";
import { AppError, respondWithAppError } from "../lib/errors.js";

const CSRF_COOKIE = "aff_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin.toLocaleLowerCase("en-US");
  } catch {
    return null;
  }
}

/**
 * Origin của chính request đang xử lý — "địa chỉ mà trình duyệt đã gõ để tới
 * được server này". Dựng từ scheme + Host; khi TRUST_PROXY bật, Fastify tự
 * lấy X-Forwarded-Proto / X-Forwarded-Host mà reverse proxy (Cloudflare,
 * nginx) đặt vào, nên sau proxy vẫn ra đúng https://ten-mien.
 */
export function requestOwnOrigin(request: FastifyRequest): string | null {
  if (!request.host) return null;
  return normalizedOrigin(`${request.protocol}://${request.host}`);
}

export function isAllowedOrigin(
  requestOrigin: string,
  allowedOrigins: string | readonly (string | null)[],
): boolean {
  const received = normalizedOrigin(requestOrigin);
  if (!received) return false;
  const candidates =
    typeof allowedOrigins === "string" ? [allowedOrigins] : allowedOrigins;
  return candidates.some(
    (candidate) => candidate !== null && normalizedOrigin(candidate) === received,
  );
}

function getReplyLocals(reply: FastifyReply): Record<string, unknown> {
  const target = reply as FastifyReply & {
    locals?: Record<string, unknown>;
  };
  target.locals ??= {};
  return target.locals;
}

function tokenFromSecret(secret: string, appSecret: string): string {
  return createHmac("sha256", appSecret)
    .update(`csrf:${secret}`)
    .digest("base64url");
}

export async function registerCsrfProtection(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  app.decorateRequest("csrfToken", "");

  app.addHook("preHandler", async (request, reply) => {
    /*
     * App di động xác thực bằng header Authorization chứ không bằng cookie.
     *
     * CSRF tồn tại đúng vì một lý do: trình duyệt TỰ đính kèm cookie vào mọi
     * yêu cầu gửi tới miền đó, kể cả yêu cầu do trang của kẻ tấn công tạo ra.
     * Trình duyệt không bao giờ tự thêm header Authorization, nên ở nhánh
     * bearer không có quyền hạn ngầm nào để lợi dụng — kiểm tra CSRF không
     * bảo vệ thêm được gì, mà cấp cookie CSRF cho app cũng vô nghĩa.
     *
     * Hook xác thực ở auth/session.ts chạy trong onRequest nên đã gán xong
     * authScheme trước khi tới đây.
     */
    if (request.authScheme === "bearer") return;

    let secret: string | undefined;
    const signedCookie = request.cookies[CSRF_COOKIE];
    if (signedCookie) {
      const unsigned = request.unsignCookie(signedCookie);
      if (unsigned.valid) secret = unsigned.value;
    }

    if (!secret) {
      secret = randomToken(24);
      reply.setCookie(CSRF_COOKIE, secret, {
        path: "/",
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        signed: true,
        maxAge: 24 * 60 * 60,
      });
    }

    request.csrfToken = tokenFromSecret(secret, config.APP_SECRET);
    getReplyLocals(reply).csrfToken = request.csrfToken;

    if (
      SAFE_METHODS.has(request.method) ||
      request.routeOptions.config.csrf === false
    ) {
      return;
    }

    /*
     * Origin hợp lệ khi trùng APP_ORIGIN HOẶC trùng chính địa chỉ mà request
     * này đi tới (scheme + Host). Vế thứ hai là phép kiểm tra Origin-so-với-
     * đích chuẩn của OWASP: trang của kẻ tấn công không thể ép trình duyệt
     * nạn nhân đổi header Host của yêu cầu gửi tới server thật, còn nếu hắn
     * trỏ tên miền riêng vào IP của ta thì trình duyệt cũng không đính cookie
     * phiên của ta vào tên miền đó — nên không mở thêm lỗ hổng nào, và token
     * CSRF bên dưới vẫn phải khớp như cũ.
     *
     * Vì sao cần: cùng một server được mở bằng nhiều địa chỉ — dev server
     * localhost:3000, bản Docker localhost:3002, IP LAN cho điện thoại, IP
     * Tailscale cho dev từ xa. Chỉ khớp cứng APP_ORIGIN thì mọi địa chỉ khác
     * đều bị 403 "Địa chỉ truy cập đã thay đổi" dù người dùng không làm gì sai.
     */
    const origin = request.headers.origin;
    const ownOrigin = requestOwnOrigin(request);
    if (origin && !isAllowedOrigin(origin, [config.APP_ORIGIN, ownOrigin])) {
      request.log.warn(
        {
          receivedOrigin: normalizedOrigin(origin) ?? "invalid",
          allowedOrigin: normalizedOrigin(config.APP_ORIGIN) ?? "invalid",
          requestOrigin: ownOrigin ?? "invalid",
        },
        "Từ chối yêu cầu do Origin không khớp",
      );
      // Ném lỗi ở đây bị Fastify xử lý qua nhánh mặc định (bỏ qua
      // setErrorHandler) vì hook này chạy trong lúc content-type parser
      // đang hoàn tất — nên tự render phản hồi thay vì throw.
      return respondWithAppError(
        request,
        reply,
        new AppError(
          "INVALID_ORIGIN",
          "Địa chỉ truy cập đã thay đổi. Hãy mở lại trang đăng ký từ liên kết hiện tại rồi thử lại.",
          403,
        ),
      );
    }

    const body =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    const provided =
      String(request.headers["x-csrf-token"] ?? "") ||
      String(body._csrf ?? "");

    if (!provided || !safeStringEqual(provided, request.csrfToken)) {
      return respondWithAppError(
        request,
        reply,
        new AppError(
          "INVALID_CSRF",
          "Phiên thao tác đã hết hạn. Hãy tải lại trang và thử lại.",
          403,
        ),
      );
    }
  });
}
