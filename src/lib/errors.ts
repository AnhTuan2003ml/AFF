import type { FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError(
    "INTERNAL_ERROR",
    "Hệ thống đang bận. Vui lòng thử lại sau.",
    500,
  );
}

/**
 * Render một AppError trực tiếp (không throw). Dùng trong các hook chạy trong
 * lúc content-type parser còn đang xử lý body (CSRF, v.v.) — throw ở đó khiến
 * Fastify trả lỗi qua nhánh mặc định (JSON thô), bỏ qua setErrorHandler tùy
 * biến của app. Giữ cùng logic phân nhánh JSON/HTML với setErrorHandler.
 */
export function respondWithAppError(
  request: FastifyRequest,
  reply: FastifyReply,
  appError: AppError,
): FastifyReply {
  if (request.url.startsWith("/api/")) {
    return reply.code(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
        requestId: request.id,
        details: appError.details,
      },
    });
  }
  return reply.code(appError.statusCode).view("error.njk", {
    pageTitle: "Không thể hoàn tất",
    statusCode: appError.statusCode,
    message: appError.message,
    requestId: request.id,
  });
}
