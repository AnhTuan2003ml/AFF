import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

const FLASH_COOKIE = "aff_flash";
const WELCOME_COOKIE = "aff_welcome";

export type FlashType = "success" | "error" | "info";

/**
 * Cờ MỘT LẦN "vừa đăng nhập" — đặt khi tạo phiên đăng nhập, tiêu thụ ở lần
 * render trang /app đầu tiên để bật hiệu ứng linh vật chào mừng. Cookie ký +
 * httpOnly, tự hết sau 2 phút; tiêu thụ xong xoá luôn nên không lặp khi chuyển
 * trang hay tải lại.
 */
export function setWelcome(reply: FastifyReply, config: AppConfig): void {
  reply.setCookie(WELCOME_COOKIE, "1", {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    maxAge: 120,
  });
}

export function consumeWelcome(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const signed = request.cookies[WELCOME_COOKIE];
  if (!signed) return false;
  reply.clearCookie(WELCOME_COOKIE, { path: "/" });
  const unsigned = request.unsignCookie(signed);
  return Boolean(unsigned.valid && unsigned.value === "1");
}

export function setFlash(
  reply: FastifyReply,
  config: AppConfig,
  type: FlashType,
  message: string,
): void {
  const payload = Buffer.from(JSON.stringify({ type, message }), "utf8").toString(
    "base64url",
  );
  reply.setCookie(FLASH_COOKIE, payload, {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    maxAge: 60,
  });
}

export function consumeFlash(
  request: FastifyRequest,
  reply: FastifyReply,
): { type: FlashType; message: string } | null {
  const signed = request.cookies[FLASH_COOKIE];
  if (!signed) return null;
  reply.clearCookie(FLASH_COOKIE, { path: "/" });

  const unsigned = request.unsignCookie(signed);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(unsigned.value, "base64url").toString("utf8"),
    ) as { type?: unknown; message?: unknown };
    if (
      !["success", "error", "info"].includes(String(parsed.type)) ||
      typeof parsed.message !== "string"
    ) {
      return null;
    }
    return {
      type: parsed.type as FlashType,
      message: parsed.message.slice(0, 500),
    };
  } catch {
    return null;
  }
}
