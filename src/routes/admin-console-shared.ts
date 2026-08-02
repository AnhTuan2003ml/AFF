import type { FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import type { EmailService } from "../services/email.js";

export interface AdminConsoleDeps {
  db: Database;
  config: AppConfig;
  emailService: EmailService;
}

export const STAFF_ROLES = [
  "USER",
  "SUPPORT",
  "FINANCE",
  "RISK",
  "AUDITOR",
  "ADMIN",
] as const;

export const USER_STATUSES = [
  "ALL",
  "PENDING_EMAIL",
  "ACTIVE",
  "LOCKED",
  "DISABLED",
] as const;

export function pageNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function selectedValue<T extends readonly string[]>(
  allowed: T,
  value: unknown,
  fallback: T[number],
): T[number] {
  const candidate = String(value ?? "").toUpperCase();
  return (allowed as readonly string[]).includes(candidate)
    ? (candidate as T[number])
    : fallback;
}

export function flashAdminError(
  reply: FastifyReply,
  config: AppConfig,
  error: unknown,
): void {
  setFlash(
    reply,
    config,
    "error",
    error instanceof AppError
      ? error.message
      : "Không thể hoàn tất thao tác.",
  );
}
