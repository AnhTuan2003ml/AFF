import { createHmac } from "node:crypto";
import type { AppConfig } from "../config.js";

/**
 * Lazada Open Platform. Chữ ký kiểu "TOP": sort tham số A→Z, nối
 * `{apiPath}{key}{value}...`, HMAC-SHA256 hex in hoa với app_secret.
 * Lazada không có API công khai cho hoa hồng theo sản phẩm — chỉ lấy
 * tên/ảnh/giá; hoa hồng dùng LAZADA_DEFAULT_COMMISSION_RATE_BPS.
 */

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

export interface LazadaProductItem {
  itemId: string;
  skuId?: string;
  productName?: string;
  imageUrl?: string;
  /** Giá thực tế người mua trả — ưu tiên special_price (giá khuyến mãi). */
  priceVnd?: number;
  /** Giá gốc trước giảm (sku.price) — chỉ có nghĩa khi lớn hơn priceVnd. */
  originalPriceVnd?: number;
}

const BASE_URL = "https://api.lazada.vn/rest";
const API_PATH = "/product/item/get";

/*
 * Access token ưu tiên lấy từ OAuth (DB, tự refresh — src/services/
 * lazada-oauth.ts); ENV LAZADA_OPEN_API_ACCESS_TOKEN chỉ còn là fallback
 * tương thích cũ. Provider được server.ts đăng ký lúc khởi động — tách qua
 * setter để file này không import lazada-oauth (tránh vòng import, và test
 * cũ chạy nguyên trạng khi chưa đăng ký provider).
 */
export type LazadaAccessTokenProvider = (
  config: AppConfig,
) => Promise<string | null>;

let accessTokenProvider: LazadaAccessTokenProvider | null = null;

export function setLazadaAccessTokenProvider(
  provider: LazadaAccessTokenProvider | null,
): void {
  accessTokenProvider = provider;
}

async function resolveLazadaAccessToken(config: AppConfig): Promise<string> {
  if (accessTokenProvider) {
    try {
      const token = await accessTokenProvider(config);
      if (token) return token;
    } catch {
      // Provider hỏng thì rơi về ENV — không được chặn tra cứu sản phẩm.
    }
  }
  return config.LAZADA_OPEN_API_ACCESS_TOKEN;
}

export function isLazadaOpenApiConfigured(config: AppConfig): boolean {
  return Boolean(
    config.LAZADA_OPEN_API_APP_KEY &&
      config.LAZADA_OPEN_API_APP_SECRET &&
      (config.LAZADA_OPEN_API_ACCESS_TOKEN || accessTokenProvider),
  );
}

export function signLazadaRequest(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string,
): string {
  const sortedKeys = Object.keys(params).sort();
  const base = sortedKeys.reduce(
    (acc, key) => `${acc}${key}${params[key]}`,
    apiPath,
  );
  return createHmac("sha256", appSecret)
    .update(base, "utf8")
    .digest("hex")
    .toUpperCase();
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

function optionalVnd(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const rounded = Math.round(parsed);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

function skuIdentifier(sku: JsonObject | null): string | undefined {
  if (!sku) return undefined;
  return optionalString(
    sku.SkuId ??
      sku.skuId ??
      sku.sku_id ??
      sku.ShopSku ??
      sku.shopSku ??
      sku.shop_sku,
  );
}

// Payload GetProductItem khác nhau tuỳ phiên bản API — đọc linh hoạt nhiều tên field.
export function parseLazadaProductPayload(
  payload: unknown,
  itemId: string,
  skuId?: string,
): LazadaProductItem | null {
  const root = asObject(payload);
  if (!root || root.code !== undefined && root.code !== "0" && root.code !== 0) {
    return null;
  }
  const data = asObject(root.data) ?? root;
  const skus = Array.isArray(data.skus) ? data.skus : [];
  const selectedSku =
    skuId === undefined
      ? null
      : (skus.map(asObject).find((sku) => skuIdentifier(sku) === skuId) ?? null);
  const firstSku = selectedSku ?? asObject(skus[0]);

  const productName = optionalString(
    data.attributes && asObject(data.attributes)?.name !== undefined
      ? asObject(data.attributes)?.name
      : data.name ?? data.title,
  );
  const images = Array.isArray(data.images) ? data.images : [];
  const imageUrl = optionalString(images[0]) ?? optionalString(firstSku?.Images);
  // Người mua trả theo sku.special_price; sku.price là giá gốc, chỉ hiện
  // gạch ngang khi thực sự cao hơn.
  const listPriceVnd =
    optionalVnd(firstSku?.price) ?? optionalVnd(data.price);
  const priceVnd =
    optionalVnd(firstSku?.special_price) ?? listPriceVnd;
  const originalPriceVnd =
    listPriceVnd !== undefined && priceVnd !== undefined && listPriceVnd > priceVnd
      ? listPriceVnd
      : undefined;

  if (!productName && !imageUrl && priceVnd === undefined) return null;

  return {
    itemId,
    ...(skuId ? { skuId } : {}),
    ...(productName ? { productName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(originalPriceVnd !== undefined ? { originalPriceVnd } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
  };
}

export async function fetchLazadaProductItem(
  config: AppConfig,
  itemId: string,
  skuIdOrFetcher?: string | Fetcher,
  fetcher: Fetcher = fetch,
): Promise<LazadaProductItem | null> {
  if (!isLazadaOpenApiConfigured(config)) return null;
  if (!/^\d{1,20}$/.test(itemId)) return null;
  const skuId =
    typeof skuIdOrFetcher === "string" && /^\d{1,30}$/.test(skuIdOrFetcher)
      ? skuIdOrFetcher
      : undefined;
  const requestFetcher =
    typeof skuIdOrFetcher === "function" ? skuIdOrFetcher : fetcher;

  // DB OAuth token (tự refresh) → fallback ENV.
  const accessToken = await resolveLazadaAccessToken(config);
  if (!accessToken) return null;

  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    access_token: accessToken,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    item_id: itemId,
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
    const response = await requestFetcher(endpoint, {
      redirect: "error",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) return null;
    return parseLazadaProductPayload(JSON.parse(text), itemId, skuId);
  } catch {
    return null;
  }
}
