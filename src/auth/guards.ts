import type { FastifyReply, FastifyRequest } from "fastify";
import type { CurrentUser } from "../types/fastify.js";
import { AppError } from "../lib/errors.js";

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!request.currentUser) {
    const next = encodeURIComponent(request.url);
    await reply.redirect(`/dang-nhap?next=${next}`);
  }
}

export async function requireApiUser(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) {
    throw new AppError(
      "AUTH_REQUIRED",
      "Bạn cần đăng nhập để tiếp tục.",
      401,
    );
  }
}

export function requireRoles(...roles: CurrentUser["role"][]) {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.currentUser) {
      await reply.redirect("/dang-nhap");
      return;
    }
    if (!roles.includes(request.currentUser.role)) {
      throw new AppError(
        "FORBIDDEN",
        "Bạn không có quyền mở khu vực này.",
        403,
      );
    }
  };
}

export function safeNextPath(value: unknown, fallback = "/app"): string {
  const candidate = String(value ?? "");
  if (
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\")
  ) {
    return candidate;
  }
  return fallback;
}
