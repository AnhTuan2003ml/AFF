import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
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

export function isAllowedOrigin(
  requestOrigin: string,
  configuredOrigin: string,
): boolean {
  const received = normalizedOrigin(requestOrigin);
  const allowed = normalizedOrigin(configuredOrigin);
  return Boolean(received && allowed && received === allowed);
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

    const origin = request.headers.origin;
    if (origin && !isAllowedOrigin(origin, config.APP_ORIGIN)) {
      request.log.warn(
        {
          receivedOrigin: normalizedOrigin(origin) ?? "invalid",
          allowedOrigin: normalizedOrigin(config.APP_ORIGIN) ?? "invalid",
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
