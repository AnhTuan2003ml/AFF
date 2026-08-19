import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

const FLASH_COOKIE = "aff_flash";

export type FlashType = "success" | "error" | "info";

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
