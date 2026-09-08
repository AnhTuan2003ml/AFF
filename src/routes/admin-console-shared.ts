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

// Chỉ còn 2 cấp: người dùng và quản trị.
export const STAFF_ROLES = ["USER", "ADMIN"] as const;

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

/**
 * Số dòng mỗi trang cho các bảng danh sách ở /backoffice.
 *
 * Chỉ nhận đúng bốn mức trong danh sách — giá trị đến từ query string nên
 * KHÔNG được tin: một `?perPage=100000` sẽ kéo cả bảng users lên RAM và
 * treo trang. Giá trị lạ rơi về mặc định thay vì báo lỗi, vì đây là tham số
 * hiển thị, không phải dữ liệu nghiệp vụ.
 */
export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;

export function perPageNumber(value: unknown, fallback = 20): number {
  const parsed = Number(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : fallback;
}

/**
 * Gói dữ liệu phân trang cho template (macro `pagination_bar` ở
 * views/partials/macros.njk dựng thanh điều khiển từ đây).
 */
export interface PaginationView {
  page: number;
  perPage: number;
  pages: number;
  total: number;
  /** Số thứ tự dòng đầu/cuối đang hiển thị — cho câu "Hiện 1–20 / 135". */
  from: number;
  to: number;
  options: readonly number[];
}

export function buildPagination(
  page: number,
  perPage: number,
  total: number,
): PaginationView {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, pages);
  return {
    page: safePage,
    perPage,
    pages,
    total,
    from: total === 0 ? 0 : (safePage - 1) * perPage + 1,
    to: Math.min(safePage * perPage, total),
    options: PER_PAGE_OPTIONS,
  };
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
