import type { AppConfig } from "../config.js";
import { signLazadaRequest } from "./lazada-open-api.js";

/**
 * Lazada AFFILIATE Open Platform (adsense.lazada.vn → "Mở API").
 *
 * Khác với Open Platform seller (/product/item/get, cần OAuth access_token),
 * API affiliate ký cùng lược đồ "TOP" (app_key + sign HMAC-SHA256) nhưng xác
 * thực bằng User Token truyền như BUSINESS PARAM `userToken` — KHÔNG phải
 * access_token hệ thống. Đây là nguồn HOA HỒNG THẬT theo sản phẩm.
 *
 * Endpoint `/marketing/product/feed` (offerType=1 Regular) trả mỗi sản phẩm:
 *   · discountPrice          — giá bán (VND, số nguyên; có thể kèm .00)
 *   · totalCommissionAmount  — hoa hồng affiliate (VND trực tiếp)
 *   · totalCommissionRate    — tỷ lệ hoa hồng dạng PHÂN SỐ (0.05 = 5%)
 *   · productName / pictures[0] / sellerName
 * (Đã kiểm chứng thực tế: iPhone 37.990.000₫ commission 0; Lenovo 96.640.700₫
 * rate 0.05 → amount 4.832.035₫.)
 */

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

const BASE_URL = "https://api.lazada.vn/rest";
const API_PATH = "/marketing/product/feed";

export interface LazadaAffiliateProduct {
  itemId: string;
  productName?: string;
  shopName?: string;
  imageUrl?: string;
  /** Giá bán người mua trả (VND). */
  priceVnd?: number;
  /** Hoa hồng affiliate của đơn (VND) — có thể là 0 khi sản phẩm không có hoàn. */
  commissionVnd?: number;
  /** Tỷ lệ hoa hồng theo bps (1/10000) — quy từ totalCommissionRate (phân số). */
  commissionRateBps?: number;
}

export function isLazadaAffiliateConfigured(config: AppConfig): boolean {
  return Boolean(
    config.LAZADA_OPEN_API_APP_KEY &&
      config.LAZADA_OPEN_API_APP_SECRET &&
      config.LAZADA_AFFILIATE_USER_TOKEN,
  );
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

/** VND: nhận số hoặc chuỗi "96000000.00"; làm tròn xuống, không âm. */
function optionalVnd(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const rounded = Math.floor(parsed);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

/** Tỷ lệ phân số (0.05) → bps (500). Chặn trong [0, 10000]. */
function fractionToBps(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const bps = Math.round(parsed * 10000);
  if (bps < 0 || bps > 10000) return undefined;
  return bps;
}

export function parseLazadaAffiliateFeed(
  payload: unknown,
  itemId: string,
): LazadaAffiliateProduct | null {
  const root = asObject(payload);
  if (!root || (root.code !== "0" && root.code !== 0)) return null;
  const result = asObject(root.result);
  const data = Array.isArray(result?.data) ? result!.data : [];
  // Ưu tiên đúng productId đã hỏi; nếu API trả một sản phẩm thì lấy sản phẩm đó.
  const item =
    data.map(asObject).find((p) => String(p?.productId ?? "") === itemId) ??
    asObject(data[0]);
  if (!item) return null;

  const productName = optionalString(item.productName);
  const images = Array.isArray(item.pictures) ? item.pictures : [];
  const imageUrl = optionalString(images[0]);
  const shopName = optionalString(item.sellerName);
  const priceVnd = optionalVnd(item.discountPrice);
  const commissionVnd = optionalVnd(item.totalCommissionAmount);
  const commissionRateBps = fractionToBps(item.totalCommissionRate);

  if (!productName && !imageUrl && priceVnd === undefined) return null;

  return {
    itemId,
    ...(productName ? { productName } : {}),
    ...(shopName ? { shopName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(commissionVnd !== undefined ? { commissionVnd } : {}),
    ...(commissionRateBps !== undefined ? { commissionRateBps } : {}),
  };
}

export async function fetchLazadaAffiliateProduct(
  config: AppConfig,
  itemId: string,
  fetcher: Fetcher = fetch,
): Promise<LazadaAffiliateProduct | null> {
  if (!isLazadaAffiliateConfigured(config)) return null;
  if (!/^\d{1,20}$/.test(itemId)) return null;

  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    offerType: "1",
    userToken: config.LAZADA_AFFILIATE_USER_TOKEN,
    productIds: `[${itemId}]`,
    page: "1",
    limit: "20",
  };
  const sign = signLazadaRequest(
    API_PATH,
    params,
    config.LAZADA_OPEN_API_APP_SECRET,
  );

  const endpoint = new URL(`${BASE_URL}${API_PATH}`);
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }
  endpoint.searchParams.set("sign", sign);

  try {
    const response = await fetcher(endpoint, {
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) return null;
    return parseLazadaAffiliateFeed(JSON.parse(text), itemId);
  } catch {
    return null;
  }
}
