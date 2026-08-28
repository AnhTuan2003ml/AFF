import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type { AppConfig } from "../config.js";

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function keyedHash(value: string, pepper: string): string {
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export function hashSensitiveValue(value: string, config: AppConfig): string {
  return keyedHash(value, config.IP_HASH_PEPPER);
}

export function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function randomClickId(): string {
  return randomBytes(12).toString("base64url");
}

// Khách thường: mã giới thiệu là 6 CHỮ SỐ random, không được sửa.
// (Đối tác/KOL có thể đổi sang mã chữ+số qua duyệt admin — referral-code.ts.)
export function randomReferralCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function encryptionKey(config: AppConfig): Buffer {
  return Buffer.from(config.FIELD_ENCRYPTION_KEY, "base64");
}

export function encryptField(value: string, config: AppConfig): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(config), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptField(payload: string, config: AppConfig): string {
  const [version, ivEncoded, tagEncoded, dataEncoded] = payload.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !dataEncoded) {
    throw new Error("Dữ liệu mã hóa không đúng định dạng.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(config),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function maskAccountName(name: string): string {
  const words = name.trim().replace(/\s+/g, " ").split(" ");
  return words
    .map((word) => {
      const first = word.charAt(0);
      return `${first}${"*".repeat(Math.max(1, word.length - 1))}`;
    })
    .join(" ");
}

export function lastFour(value: string): string {
  return value.replace(/\D/g, "").slice(-4).padStart(4, "*");
}
