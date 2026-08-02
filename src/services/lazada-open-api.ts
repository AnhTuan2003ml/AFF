import { createHmac } from "node:crypto";
import type { AppConfig } from "../config.js";

/**
 * Lazada Open Platform (LazOP) — https://api.lazada.vn/rest
 *
 * Cần đăng ký app tại open.lazada.com và được duyệt mới có App Key/Secret;
 * Access Token lấy qua luồng OAuth của Lazada (app này chưa tự làm luồng
 * OAuth/refresh token — dán token thủ công vào cấu hình và tự gia hạn khi
 * hết hạn, thường ~30 ngày).
 *
 * Xác thực: mọi tham số (trừ `sign`) được sắp xếp theo tên (A→Z), nối thành
 * chuỗi `{apiPath}{key1}{value1}{key2}{value2}...` rồi ký bằng
 * HMAC-SHA256(chuỗi, app_secret), in hoa dạng hex — đúng lược đồ chữ ký
 * "TOP" mà Lazada kế thừa từ Alibaba Open Platform.
 *
 * LƯU Ý: Lazada tuyên bố hoa hồng/commission KHÔNG được chia sẻ cho bên thứ
 * ba nếu chưa có sự đồng ý bằng văn bản của Lazada — endpoint dưới đây chỉ
 * lấy THÔNG TIN SẢN PHẨM (tên/ảnh/giá) qua GetProductItem, không có API
 * công khai để lấy tỷ lệ hoa hồng theo từng sản phẩm. Hoa hồng vẫn tính qua
 * LAZADA_DEFAULT_COMMISSION_RATE_BPS (tỷ lệ đã thoả thuận/khai báo thủ công)
 * cho tới khi có quyền truy cập API hoa hồng chính thức.
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

export function isLazadaOpenApiConfigured(config: AppConfig): boolean {
  return Boolean(
    config.LAZADA_OPEN_API_APP_KEY &&
      config.LAZADA_OPEN_API_APP_SECRET &&
      config.LAZADA_OPEN_API_ACCESS_TOKEN,
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

/**
 * Payload trả về của GetProductItem có thể khác nhau tuỳ phiên bản API —
 * đọc linh hoạt nhiều tên field thường gặp (giống cách đọc partner API
 * chung ở product-preview.ts) thay vì giả định đúng một cấu trúc cố định.
 */
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
  // sku.price = giá gốc (list price), sku.special_price = giá đang bán khi có
  // khuyến mãi (thường bằng giá gốc nếu không giảm) — người mua trả theo
  // special_price nên đó mới là priceVnd; price chỉ hiển thị gạch ngang khi
  // thực sự cao hơn.
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

  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    access_token: config.LAZADA_OPEN_API_ACCESS_TOKEN,
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
