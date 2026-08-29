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

/**
 * Các trang trong /app mà KHÁCH (chưa đăng nhập) vẫn xem được — chỉ GET/HEAD:
 * trang chủ + băng sản phẩm chung, Khám phá (kèm danh mục sống phân trang) và
 * trang Hỗ trợ (xem mẫu yêu cầu; bấm gửi thì vẫn phải đăng nhập). Mọi đường dẫn
 * khác trong /app và mọi POST đều bắt đăng nhập. Một danh sách duy nhất để
 * preHandler của /app và test cùng đọc.
 */
export const GUEST_APP_PATHS: ReadonlySet<string> = new Set([
  "/app",
  "/app/promo-products",
  // Popup quảng cáo khi mở app — app native (guest lẫn đã đăng nhập) cùng đọc.
  "/app/entry-promo",
  "/app/discover",
  "/app/discover/offer-products",
  "/app/discover/lazada-offers",
  "/app/support",
]);

export function isGuestAppPath(method: string, url: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  const path = (url.split("?")[0] ?? "").replace(/\/+$/, "");
  return GUEST_APP_PATHS.has(path);
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
