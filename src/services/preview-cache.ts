import { randomToken } from "../lib/crypto.js";
import type { ProductPreview } from "./product-preview.js";

/**
 * Cache tạm kết quả tra cứu sản phẩm (in-memory, theo tiến trình web).
 *
 * Luồng: người dùng "Tra cứu" → lưu preview kèm previewId; khi bấm "Mua ngay"
 * server đọc lại snapshot đáng tin cậy từ đây để tạo link Affiliate — client
 * không được tự gửi giá/tiền hoàn lên.
 */

export interface CachedPreview {
  userId: string;
  product: ProductPreview;
}

interface CacheEntry extends CachedPreview {
  expiresAt: number;
}

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 2_000;

const entries = new Map<string, CacheEntry>();

function evictExpired(now: number): void {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
  // Map giữ thứ tự chèn nên phần tử đầu là phần tử cũ nhất.
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function storePreview(userId: string, product: ProductPreview): string {
  const now = Date.now();
  evictExpired(now);
  const previewId = randomToken(16);
  entries.set(previewId, { userId, product, expiresAt: now + PREVIEW_TTL_MS });
  return previewId;
}

export function takePreview(
  userId: string,
  previewId: string,
): CachedPreview | null {
  const entry = entries.get(previewId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() || entry.userId !== userId) {
    entries.delete(previewId);
    return null;
  }
  return { userId: entry.userId, product: entry.product };
}

export function clearPreviews(): void {
  entries.clear();
}
