import type { AppConfig } from "../config.js";
import { AppError } from "../lib/errors.js";
import {
  isAllowedPlatformHost,
  platformLabel,
  resolveProductUrl,
  type ProductPlatform,
} from "./affiliate.js";
import {
  fetchShopeeProductOffer,
  type ShopeeProductOffer,
} from "./shopee-open-api.js";
import { fetchLazadaProductItem, type LazadaProductItem } from "./lazada-open-api.js";
import {
  fetchTikTokAffiliateProduct,
  type TikTokAffiliateProduct,
} from "./tiktok-open-api.js";

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

export type CommissionSource =
  | "PARTNER_API"
  | "CONFIGURED_RATE"
  | "UNAVAILABLE";

export interface ProductPreview {
  platform: ProductPlatform;
  platformLabel: string;
  normalizedUrl: string;
  productId: string | null;
  shopId: string | null;
  productName: string;
  shopName: string | null;
  imageUrl: string | null;
  priceVnd: number | null;
  /** Giá gốc trước giảm — chỉ khác null khi sàn thực sự đang có khuyến mãi. */
  originalPriceVnd: number | null;
  affiliateCommissionVnd: number | null;
  buyerCashbackVnd: number | null;
  buyerCashbackPercent: number;
  commissionRateBps: number | null;
  commissionSource: CommissionSource;
  dataStatus: "COMPLETE" | "PARTIAL";
  estimateOnly: true;
}

interface ProductData {
  productId?: string;
  shopId?: string;
  productName?: string;
  shopName?: string;
  imageUrl?: string;
  priceVnd?: number;
  originalPriceVnd?: number;
  affiliateCommissionVnd?: number;
  commissionRateBps?: number;
}

interface ProductIdentity {
  productId: string;
  shopId?: string;
  skuId?: string;
}

interface PlatformProductConfig {
  apiUrl: string;
  apiToken: string;
  affiliateId: string;
  defaultCommissionRateBps: number;
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SHORT_LINK_RESPONSE_BYTES = 512 * 1024;
const SHORT_LINK_HOSTS = new Set([
  "s.shopee.vn",
  "shp.ee",
  "vn.shp.ee",
  "vt.tiktok.com",
  "vm.tiktok.com",
  "s.lazada.vn",
  "c.lazada.vn",
]);
const PARTNER_KEYS = {
  productName: ["productName", "product_name", "name", "title"],
  shopName: ["shopName", "shop_name", "sellerName", "seller_name", "brand"],
  imageUrl: [
    "imageUrl",
    "image_url",
    "productImage",
    "product_image",
    "image",
    "thumbnail",
  ],
  productId: [
    "productId",
    "product_id",
    "itemId",
    "item_id",
    "skuId",
    "sku_id",
  ],
  shopId: ["shopId", "shop_id", "sellerId", "seller_id"],
  priceVnd: [
    "priceVnd",
    "price_vnd",
    "salePrice",
    "sale_price",
    "price",
  ],
  originalPriceVnd: [
    "originalPriceVnd",
    "original_price_vnd",
    "originalPrice",
    "original_price",
    "listPrice",
    "list_price",
    "priceBeforeDiscount",
    "price_before_discount",
  ],
  affiliateCommissionVnd: [
    "affiliateCommissionVnd",
    "affiliate_commission_vnd",
    "commissionVnd",
    "commission_vnd",
    "estimatedCommission",
    "estimated_commission",
    "commission",
  ],
  commissionRateBps: [
    "commissionRateBps",
    "commission_rate_bps",
    "affiliateCommissionRateBps",
    "affiliate_commission_rate_bps",
  ],
} as const;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function firstValue(
  object: JsonObject,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null) return object[key];
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function optionalMoney(value: unknown): number | undefined {
  if (typeof value === "string") {
    const currency = value.replace(/[^\d.,-]/g, "");
    value = /^-?\d{1,3}(?:[.,]\d{3})+$/.test(currency)
      ? currency.replace(/[.,]/g, "")
      : currency.replaceAll(",", "");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const rounded = Math.round(parsed);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

function optionalBps(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10000) {
    return undefined;
  }
  return Math.round(parsed);
}

function safeImageUrl(value: unknown): string | undefined {
  const raw = optionalString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    if (/^[a-zA-Z0-9_-]{8,200}$/.test(raw)) {
      return `https://down-vn.img.susercontent.com/file/${raw}`;
    }
    return undefined;
  }
}

function unwrapPartnerPayload(payload: unknown): JsonObject | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data);
  const result = asObject(root.result);
  return (
    asObject(root.productInfo) ??
    asObject(root.product_info) ??
    asObject(data?.productInfo) ??
    asObject(data?.product_info) ??
    asObject(result?.productInfo) ??
    asObject(result?.product_info) ??
    data ??
    result ??
    root
  );
}

export function parsePartnerProductPayload(
  payload: unknown,
): ProductData | null {
  const object = unwrapPartnerPayload(payload);
  if (!object) return null;

  const productName = optionalString(
    firstValue(object, PARTNER_KEYS.productName),
  );
  const shopName = optionalString(firstValue(object, PARTNER_KEYS.shopName));
  const imageUrl = safeImageUrl(firstValue(object, PARTNER_KEYS.imageUrl));
  const priceVnd = optionalMoney(firstValue(object, PARTNER_KEYS.priceVnd));
  const rawOriginalPriceVnd = optionalMoney(
    firstValue(object, PARTNER_KEYS.originalPriceVnd),
  );
  const originalPriceVnd =
    rawOriginalPriceVnd !== undefined &&
    priceVnd !== undefined &&
    rawOriginalPriceVnd > priceVnd
      ? rawOriginalPriceVnd
      : undefined;
  const affiliateCommissionVnd = optionalMoney(
    firstValue(object, PARTNER_KEYS.affiliateCommissionVnd),
  );
  const commissionRateBps = optionalBps(
    firstValue(object, PARTNER_KEYS.commissionRateBps),
  );
  const productId = optionalString(firstValue(object, PARTNER_KEYS.productId));
  const shopId = optionalString(firstValue(object, PARTNER_KEYS.shopId));

  if (
    !productName &&
    !imageUrl &&
    priceVnd === undefined &&
    affiliateCommissionVnd === undefined
  ) {
    return null;
  }

  return {
    ...(productName ? { productName } : {}),
    ...(shopName ? { shopName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(productId ? { productId } : {}),
    ...(shopId ? { shopId } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(originalPriceVnd !== undefined ? { originalPriceVnd } : {}),
    ...(affiliateCommissionVnd !== undefined
      ? { affiliateCommissionVnd }
      : {}),
    ...(commissionRateBps !== undefined ? { commissionRateBps } : {}),
  };
}

export function parseShopeeProductIdentity(
  input: string,
): { shopId: string; productId: string } | null {
  const url = new URL(input);
  const productPath = url.pathname.match(/\/product\/(\d+)\/(\d+)(?:\/|$)/i);
  if (productPath?.[1] && productPath[2]) {
    return { shopId: productPath[1], productId: productPath[2] };
  }

  const slugPath = url.pathname.match(/-i\.(\d+)\.(\d+)(?:\/|$)/i);
  if (slugPath?.[1] && slugPath[2]) {
    return { shopId: slugPath[1], productId: slugPath[2] };
  }

  const shopId = url.searchParams.get("shopid");
  const productId =
    url.searchParams.get("itemid") ?? url.searchParams.get("item_id");
  return shopId && productId && /^\d+$/.test(shopId) && /^\d+$/.test(productId)
    ? { shopId, productId }
    : null;
}

export function parseTikTokProductIdentity(input: string): ProductIdentity | null {
  const url = new URL(input);
  const pathMatch = url.pathname.match(
    /\/(?:view\/product|product)\/(\d+)(?:\/|$)/i,
  );
  const productId =
    pathMatch?.[1] ??
    url.searchParams.get("product_id") ??
    url.searchParams.get("productId");
  return productId && /^\d+$/.test(productId) ? { productId } : null;
}

export function parseLazadaProductIdentity(input: string): ProductIdentity | null {
  const url = new URL(input);
  const pathMatch = url.pathname.match(/-i(\d+)(?:-s(\d+))?\.html(?:\/|$)/i);
  const priceCompareParams = parseLazadaPriceCompareParams(url);
  const productId =
    pathMatch?.[1] ??
    url.searchParams.get("itemId") ??
    url.searchParams.get("item_id");
  const skuId =
    pathMatch?.[2] ??
    url.searchParams.get("skuId") ??
    url.searchParams.get("sku_id") ??
    priceCompareParams.get("skuId") ??
    priceCompareParams.get("sku_id");
  return productId && /^\d+$/.test(productId)
    ? { productId, ...(skuId && /^\d+$/.test(skuId) ? { skuId } : {}) }
    : null;
}

function parseProductIdentity(
  platform: ProductPlatform,
  input: string,
): ProductIdentity | null {
  if (platform === "SHOPEE") return parseShopeeProductIdentity(input);
  if (platform === "TIKTOK") return parseTikTokProductIdentity(input);
  return parseLazadaProductIdentity(input);
}

export function calculateBuyerCashback(
  affiliateCommissionVnd: number | null,
  buyerCashbackPercent: number,
): number | null {
  if (affiliateCommissionVnd === null) return null;
  if (
    !Number.isSafeInteger(affiliateCommissionVnd) ||
    affiliateCommissionVnd < 0 ||
    !Number.isInteger(buyerCashbackPercent) ||
    buyerCashbackPercent < 0 ||
    buyerCashbackPercent > 100
  ) {
    throw new Error("Dữ liệu tính tiền hoàn không hợp lệ.");
  }
  return Math.floor(
    (affiliateCommissionVnd * buyerCashbackPercent) / 100,
  );
}

async function readResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new AppError(
      "PRODUCT_RESPONSE_TOO_LARGE",
      "Dữ liệu sản phẩm trả về vượt giới hạn an toàn.",
      502,
    );
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new AppError(
      "PRODUCT_RESPONSE_TOO_LARGE",
      "Dữ liệu sản phẩm trả về vượt giới hạn an toàn.",
      502,
    );
  }
  return text;
}

function productConfig(
  config: AppConfig,
  platform: ProductPlatform,
): PlatformProductConfig {
  if (platform === "SHOPEE") {
    return {
      apiUrl: config.SHOPEE_PRODUCT_API_URL,
      apiToken: config.SHOPEE_PRODUCT_API_TOKEN,
      affiliateId: config.SHOPEE_AFFILIATE_ID,
      defaultCommissionRateBps: config.SHOPEE_DEFAULT_COMMISSION_RATE_BPS,
    };
  }
  if (platform === "TIKTOK") {
    return {
      apiUrl: config.TIKTOK_PRODUCT_API_URL,
      apiToken: config.TIKTOK_PRODUCT_API_TOKEN,
      affiliateId: config.TIKTOK_AFFILIATE_ID,
      defaultCommissionRateBps: config.TIKTOK_DEFAULT_COMMISSION_RATE_BPS,
    };
  }
  return {
    apiUrl: config.LAZADA_PRODUCT_API_URL,
    apiToken: config.LAZADA_PRODUCT_API_TOKEN,
    affiliateId: config.LAZADA_AFFILIATE_ID,
    defaultCommissionRateBps: config.LAZADA_DEFAULT_COMMISSION_RATE_BPS,
  };
}

async function requestPartnerProduct(
  config: AppConfig,
  platform: ProductPlatform,
  productUrl: string,
  fetcher: Fetcher,
): Promise<ProductData | null> {
  const integration = productConfig(config, platform);
  if (!integration.apiUrl) return null;

  const headers: Record<string, string> = { accept: "application/json" };
  if (integration.apiToken) {
    headers.authorization = `Bearer ${integration.apiToken}`;
  }

  try {
    let request: Promise<Response>;
    if (platform === "SHOPEE") {
      // API dữ liệu sản phẩm Shopee kiểu product-data.php (cộng đồng shopee-aff):
      // GET ?item_id=<id> (khuyến nghị) hoặc ?url=<link đầy đủ>.
      // Response: { status: "success", productInfo: { productName, imageUrl,
      // price, commission, sellerComFinal, shopeeComFinal, ... } }.
      const endpoint = new URL(integration.apiUrl);
      const identity = parseShopeeProductIdentity(productUrl);
      if (identity) {
        endpoint.searchParams.set("item_id", identity.productId);
      } else {
        endpoint.searchParams.set("url", productUrl);
      }
      request = fetcher(endpoint, {
        redirect: "error",
        headers,
        signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
      });
    } else {
      headers["content-type"] = "application/json";
      request = fetcher(integration.apiUrl, {
        method: "POST",
        redirect: "error",
        headers,
        body: JSON.stringify({
          action: "lookup",
          platform,
          link: productUrl,
          productUrl,
          affiliateId: integration.affiliateId,
        }),
        signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
      });
    }
    const response = await request;
    if (!response.ok) return null;
    return parsePartnerProductPayload(
      JSON.parse(await readResponseText(response)),
    );
  } catch {
    return null;
  }
}

function parseShopeeItemPayload(
  payload: unknown,
  identity: { shopId: string; productId: string },
): ProductData | null {
  const root = asObject(payload);
  const rootData = asObject(root?.data);
  const item =
    asObject(rootData?.item) ??
    asObject(rootData?.product) ??
    rootData ??
    asObject(root?.item) ??
    root;
  if (!item) return null;

  const rawPrice =
    optionalMoney(item.price) ??
    optionalMoney(item.price_min) ??
    optionalMoney(item.price_max);
  const priceVnd =
    rawPrice === undefined ? undefined : Math.round(rawPrice / 100000);
  // price_before_discount cùng đơn vị x100000 như price — chỉ hiển thị gạch
  // ngang khi Shopee thực sự đang chạy khuyến mãi (giá trị lớn hơn priceVnd).
  const rawOriginalPrice = optionalMoney(item.price_before_discount);
  const originalPriceVndCandidate =
    rawOriginalPrice === undefined
      ? undefined
      : Math.round(rawOriginalPrice / 100000);
  const originalPriceVnd =
    originalPriceVndCandidate !== undefined &&
    priceVnd !== undefined &&
    originalPriceVndCandidate > priceVnd
      ? originalPriceVndCandidate
      : undefined;
  const productName = optionalString(item.name ?? item.title);
  const imageUrl = safeImageUrl(item.image ?? item.image_url);
  const shopName = optionalString(
    item.shop_name ?? asObject(item.shop)?.name ?? rootData?.shop_name,
  );

  if (!productName && !imageUrl && priceVnd === undefined) return null;
  return {
    productId: identity.productId,
    shopId: identity.shopId,
    ...(productName ? { productName } : {}),
    ...(shopName ? { shopName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(originalPriceVnd !== undefined ? { originalPriceVnd } : {}),
  };
}

async function requestShopeeItem(
  config: AppConfig,
  productUrl: string,
  fetcher: Fetcher,
): Promise<ProductData | null> {
  const identity = parseShopeeProductIdentity(productUrl);
  if (!identity) return null;

  const endpoints = [
    new URL("https://shopee.vn/api/v4/pdp/get_pc"),
    new URL("https://shopee.vn/api/v4/item/get"),
  ];
  endpoints[0]!.searchParams.set("item_id", identity.productId);
  endpoints[0]!.searchParams.set("shop_id", identity.shopId);
  endpoints[0]!.searchParams.set("tz_offset_minutes", "420");
  endpoints[0]!.searchParams.set("detail_level", "0");
  endpoints[1]!.searchParams.set("itemid", identity.productId);
  endpoints[1]!.searchParams.set("shopid", identity.shopId);

  const candidates = await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const response = await fetcher(endpoint, {
          redirect: "error",
          headers: {
            accept: "application/json,text/plain,*/*",
            "accept-language": "vi-VN,vi;q=0.9,en;q=0.7",
            referer: productUrl,
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
        });
        if (!response.ok) return null;
        return parseShopeeItemPayload(
          JSON.parse(await readResponseText(response)),
          identity,
        );
      } catch {
        return null;
      }
    }),
  );
  return candidates.find(Boolean) ?? null;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .trim();
}

function metaValue(html: string, key: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const property =
      tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1] ??
      "";
    if (property.toLowerCase() !== key.toLowerCase()) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return decodeHtml(content);
  }
  return undefined;
}

function jsonLdObjects(value: unknown, depth = 0): JsonObject[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => jsonLdObjects(item, depth + 1));
  }
  const object = asObject(value);
  if (!object) return [];
  return [
    object,
    ...Object.values(object).flatMap((item) =>
      jsonLdObjects(item, depth + 1),
    ),
  ];
}

function parseJsonLdProduct(html: string): ProductData | null {
  const scripts =
    html.match(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    ) ?? [];
  for (const script of scripts) {
    const json = script
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();
    try {
      const product = jsonLdObjects(JSON.parse(json)).find((candidate) => {
        const type = candidate["@type"];
        return type === "Product" ||
          (Array.isArray(type) && type.includes("Product"));
      });
      if (!product) continue;
      const offers = asObject(product.offers) ??
        (Array.isArray(product.offers)
          ? asObject(product.offers[0])
          : null);
      const imageValue = Array.isArray(product.image)
        ? product.image[0]
        : asObject(product.image)?.url ?? product.image;
      const productName = optionalString(product.name);
      const imageUrl = safeImageUrl(imageValue);
      const priceVnd = optionalMoney(
        offers?.price ?? offers?.lowPrice ?? product.price,
      );
      const brand = asObject(product.brand);
      const shopName = optionalString(
        brand?.name ?? asObject(product.seller)?.name,
      );
      if (!productName && !imageUrl && priceVnd === undefined) continue;
      return {
        ...(productName ? { productName } : {}),
        ...(shopName ? { shopName } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(priceVnd !== undefined ? { priceVnd } : {}),
      };
    } catch {
      // Bỏ qua JSON-LD lỗi và tiếp tục đọc thẻ meta.
    }
  }
  return null;
}

/**
 * Trang sản phẩm Lazada không có giá trong JSON-LD (chỉ có tên/ảnh) — giá
 * thực tế nằm trong một biến JS server-render sẵn cho mục đích tracking:
 * `var pdpTrackingData = "{...json đã escape...}";`, chứa `pdt_name` và
 * `pdt_price` (dạng chuỗi có định dạng, ví dụ "121.540 ₫") đúng theo SKU
 * đang xem. Đã xác minh trực tiếp trên trang sản phẩm thật — không cần API
 * nội bộ có chữ ký (khác với hướng "mtop" đã cân nhắc nhưng không dùng vì
 * appKey công khai chưa xác minh được).
 */
function parseLazadaTrackingData(html: string): ProductData | null {
  const match = html.match(/pdpTrackingData\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return null;
  try {
    const jsonText = JSON.parse(`"${match[1]}"`) as string;
    const data = asObject(JSON.parse(jsonText));
    if (!data) return null;
    const productName = optionalString(data.pdt_name);
    const priceVnd = optionalMoney(data.pdt_price);
    if (!productName && priceVnd === undefined) return null;
    return {
      ...(productName ? { productName } : {}),
      ...(priceVnd !== undefined ? { priceVnd } : {}),
    };
  } catch {
    return null;
  }
}

function parseLazadaEmbeddedOriginalPrice(html: string): number | undefined {
  for (const key of PARTNER_KEYS.originalPriceVnd) {
    const match = html.match(
      new RegExp(`\\\\?"${key}\\\\?"\\s*:\\s*\\\\?"?([^"\\\\}]{1,80})`, "i"),
    );
    const price = optionalMoney(match?.[1]);
    if (price !== undefined) return price;
  }
  return undefined;
}

function parseLazadaPriceCompareParams(url: URL): Map<string, string> {
  const raw = url.searchParams.get("priceCompare");
  const params = new Map<string, string>();
  if (!raw) return params;

  for (const part of raw.split(";")) {
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) params.set(key, value);
  }
  return params;
}

function parseLazadaUrlProductData(productUrl: string): ProductData | null {
  const url = new URL(productUrl);
  const params = parseLazadaPriceCompareParams(url);
  const priceVnd = optionalMoney(
    params.get("displayPrice") ?? params.get("voucherPricePlugin"),
  );
  const rawOriginalPriceVnd = optionalMoney(params.get("originPrice"));
  const originalPriceVnd =
    rawOriginalPriceVnd !== undefined &&
    priceVnd !== undefined &&
    rawOriginalPriceVnd > priceVnd
      ? rawOriginalPriceVnd
      : undefined;

  if (priceVnd === undefined && originalPriceVnd === undefined) return null;
  return {
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(originalPriceVnd !== undefined ? { originalPriceVnd } : {}),
  };
}

function parseProductHtml(
  html: string,
  platform: ProductPlatform,
): ProductData | null {
  const jsonLd = parseJsonLdProduct(html);
  const lazadaTracking =
    platform === "LAZADA" ? parseLazadaTrackingData(html) : null;
  const productName =
    jsonLd?.productName ??
    lazadaTracking?.productName ??
    metaValue(html, "og:title") ??
    metaValue(html, "twitter:title");
  const imageUrl =
    jsonLd?.imageUrl ??
    safeImageUrl(
      metaValue(html, "og:image") ?? metaValue(html, "twitter:image"),
    );
  const metaPrice = optionalMoney(
    metaValue(html, "product:price:amount") ??
      metaValue(html, "og:price:amount") ??
      metaValue(html, "price"),
  );
  const rawPrice = optionalMoney(
    html.match(
      /"(?:price|salePrice|sale_price)"\s*:\s*"?(\d+(?:\.\d+)?)"?/i,
    )?.[1],
  );
  const normalizedRawPrice =
    platform === "SHOPEE" && rawPrice !== undefined
      ? Math.round(rawPrice / 100000)
      : rawPrice;
  const priceVnd =
    jsonLd?.priceVnd ??
    lazadaTracking?.priceVnd ??
    metaPrice ??
    normalizedRawPrice;
  const originalPriceCandidate =
    platform === "LAZADA" ? parseLazadaEmbeddedOriginalPrice(html) : undefined;
  const originalPriceVnd =
    originalPriceCandidate !== undefined &&
    priceVnd !== undefined &&
    originalPriceCandidate > priceVnd
      ? originalPriceCandidate
      : undefined;

  if (!productName && !imageUrl && priceVnd === undefined) return null;
  return {
    ...(jsonLd ?? {}),
    ...(lazadaTracking ?? {}),
    ...(productName ? { productName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(originalPriceVnd !== undefined ? { originalPriceVnd } : {}),
  };
}

async function requestProductHtml(
  config: AppConfig,
  platform: ProductPlatform,
  productUrl: string,
  fetcher: Fetcher,
): Promise<ProductData | null> {
  try {
    const response = await fetcher(productUrl, {
      redirect: "error",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "vi-VN,vi;q=0.9,en;q=0.7",
        "cache-control": "no-cache",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseProductHtml(await readResponseText(response), platform);
  } catch {
    return null;
  }
}

function decodeEmbeddedUrl(value: string): string {
  let decoded = value
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!/%(?:2f|3a|3f|3d|26)/i.test(decoded)) break;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function lazadaHtmlDestination(
  html: string,
  currentUrl: string,
): string | null {
  const rawCandidates: string[] = [];
  const patterns = [
    /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<meta[^>]+(?:property|name)=["'](?:og:url|twitter:url)["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["']([^"']+)["']/gi,
    /(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
    /["'](?:targetUrl|redirectUrl|jumpUrl|productUrl|url)["']\s*:\s*["']((?:\\.|[^"'])+)["']/gi,
    /(https?:\/\/[^"'<>\s]+)/gi,
    /(https?:\\\/\\\/(?:\\.|[^"'<>\s])+)/gi,
    /(https?%3a%2f%2f[^"'<>\s]+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      if (match[1]) rawCandidates.push(match[1]);
    }
  }

  const ranked: Array<{ url: string; score: number }> = [];
  for (const raw of rawCandidates) {
    let decoded = decodeEmbeddedUrl(raw);
    const refreshTarget = decoded.match(/(?:^|[;\s])url\s*=\s*(https?:\/\/.+)$/i);
    if (refreshTarget?.[1]) decoded = refreshTarget[1];
    let candidate: URL;
    try {
      candidate = new URL(decoded, currentUrl);
    } catch {
      continue;
    }
    if (
      candidate.protocol !== "https:" ||
      candidate.username ||
      candidate.password ||
      candidate.port ||
      !isAllowedPlatformHost("LAZADA", candidate.hostname)
    ) {
      continue;
    }
    candidate.hash = "";
    const normalized = candidate.toString();
    if (normalized === currentUrl) continue;

    const host = candidate.hostname.toLowerCase();
    const isProduct = /^\/products\/.+-i\d+(?:-s\d+)?\.html\/?$/i.test(
      candidate.pathname,
    );
    const score =
      (isProduct ? 100 : 0) +
      (!SHORT_LINK_HOSTS.has(host) ? 30 : 0) +
      (host === "www.lazada.vn" || host === "m.lazada.vn" ? 10 : 0);
    ranked.push({ url: normalized, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.url ?? null;
}

async function readShortLinkHtml(response: Response): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_SHORT_LINK_RESPONSE_BYTES) return null;
  try {
    const html = await response.text();
    return Buffer.byteLength(html, "utf8") <= MAX_SHORT_LINK_RESPONSE_BYTES
      ? html
      : null;
  } catch {
    return null;
  }
}

async function resolveShortProductUrl(
  config: AppConfig,
  productUrl: string,
  platform: ProductPlatform,
  fetcher: Fetcher,
): Promise<string> {
  let current = resolveProductUrl(productUrl, platform).normalizedUrl;
  if (!SHORT_LINK_HOSTS.has(new URL(current).hostname.toLowerCase())) {
    return current;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(current, {
        redirect: "manual",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
      });
    } catch {
      throw new AppError(
        "SHORT_LINK_UNAVAILABLE",
        `Chưa mở được link rút gọn ${platformLabel(platform)}. Hãy dán link đầy đủ của sản phẩm.`,
        422,
      );
    }
    const location = response.headers.get("location");
    let next: URL | null = null;
    if (location) {
      next = new URL(location, current);
    } else if (platform === "LAZADA" && response.ok) {
      // Một số link chia sẻ s.lazada.vn trả trang chuyển tiếp HTML/JS thay vì
      // HTTP 30x. Đọc canonical/og:url/meta refresh/location/JSON nhúng để
      // lấy đúng URL sản phẩm rồi mới loại tracking Affiliate cũ.
      const html = await readShortLinkHtml(response);
      const embedded = html ? lazadaHtmlDestination(html, current) : null;
      if (embedded) next = new URL(embedded);
    }

    if (!next) {
      if (platform !== "LAZADA") return current;
      throw new AppError(
        "SHORT_LINK_UNRESOLVED",
        "Chưa mở được link chia sẻ Lazada về sản phẩm. Hãy thử lại hoặc dán link đầy đủ có dạng lazada.vn/products/...html.",
        422,
      );
    }
    if (!isAllowedPlatformHost(platform, next.hostname)) {
      throw new AppError(
        "UNSAFE_PRODUCT_REDIRECT",
        `Link rút gọn chuyển tới địa chỉ không thuộc ${platformLabel(platform)}.`,
      );
    }
    current = resolveProductUrl(next.toString(), platform).normalizedUrl;
    if (!SHORT_LINK_HOSTS.has(new URL(current).hostname.toLowerCase())) {
      return current;
    }
  }

  throw new AppError(
    "TOO_MANY_PRODUCT_REDIRECTS",
    "Link sản phẩm chuyển hướng quá nhiều lần.",
  );
}

function mergeProductData(
  primary: ProductData | null,
  fallback: ProductData | null,
): ProductData {
  return {
    ...(fallback ?? {}),
    ...(primary ?? {}),
  };
}

function offerToProductData(
  offer: ShopeeProductOffer | null,
): ProductData | null {
  if (!offer) return null;
  const imageUrl = safeImageUrl(offer.imageUrl);
  return {
    productId: offer.itemId,
    ...(offer.productName ? { productName: offer.productName } : {}),
    ...(offer.shopName ? { shopName: offer.shopName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(offer.priceVnd !== undefined ? { priceVnd: offer.priceVnd } : {}),
    ...(offer.commissionVnd !== undefined
      ? { affiliateCommissionVnd: offer.commissionVnd }
      : {}),
    ...(offer.commissionRateBps !== undefined
      ? { commissionRateBps: offer.commissionRateBps }
      : {}),
  };
}

function lazadaItemToProductData(
  item: LazadaProductItem | null,
): ProductData | null {
  if (!item) return null;
  const imageUrl = safeImageUrl(item.imageUrl);
  return {
    productId: item.itemId,
    ...(item.productName ? { productName: item.productName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(item.priceVnd !== undefined ? { priceVnd: item.priceVnd } : {}),
    ...(item.originalPriceVnd !== undefined
      ? { originalPriceVnd: item.originalPriceVnd }
      : {}),
  };
}

function tikTokAffiliateToProductData(
  product: TikTokAffiliateProduct | null,
): ProductData | null {
  if (!product) return null;
  const imageUrl = safeImageUrl(product.imageUrl);
  return {
    productId: product.productId,
    ...(product.productName ? { productName: product.productName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(product.priceVnd !== undefined ? { priceVnd: product.priceVnd } : {}),
    ...(product.originalPriceVnd !== undefined
      ? { originalPriceVnd: product.originalPriceVnd }
      : {}),
    ...(product.commissionRateBps !== undefined
      ? { commissionRateBps: product.commissionRateBps }
      : {}),
  };
}

function deriveProductName(
  normalizedUrl: string,
  platform: ProductPlatform,
): string | undefined {
  const url = new URL(normalizedUrl);
  let slug = "";
  if (platform === "SHOPEE") {
    slug = url.pathname.split(/-i\.\d+\.\d+/i)[0] ?? "";
  } else if (platform === "LAZADA") {
    slug = url.pathname
      .replace(/^\/products\//i, "")
      .split(/-i\d+(?:-s\d+)?\.html/i)[0] ?? "";
  } else {
    slug = url.pathname
      .replace(/^\/(?:view\/product|product)\//i, "")
      .replace(/\/\d+.*$/, "");
  }
  const text = decodeURIComponent(slug)
    .replace(/^\/+|\/+$/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 4 || /^\d+$/.test(text)) return undefined;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function lookupProductPreview(
  config: AppConfig,
  inputUrl: string,
  buyerCashbackPercent: number,
  fetcher: Fetcher = fetch,
  expectedPlatform?: ProductPlatform,
): Promise<ProductPreview> {
  const resolved = resolveProductUrl(inputUrl, expectedPlatform);
  const platform = resolved.platform;
  const normalizedUrl = await resolveShortProductUrl(
    config,
    resolved.normalizedUrl,
    platform,
    fetcher,
  );

  const identity = parseProductIdentity(platform, normalizedUrl);
  // Nguồn ưu tiên mỗi sàn: Open API chính thức (Shopee productOfferV2 /
  // Lazada GetProductItem / TikTok Affiliate Creator — có hoa hồng nếu sàn
  // trả) → partner API tự cấu hình → API sàn/HTML công khai (thường bị
  // chặn bot, đặc biệt TikTok Shop).
  const [openApiOffer, lazadaItem, tikTokProduct, partner, nativeProduct, pageProduct] =
    await Promise.all([
      platform === "SHOPEE" && identity
        ? fetchShopeeProductOffer(config, identity.productId, fetcher)
        : Promise.resolve(null),
      platform === "LAZADA" && identity
        ? fetchLazadaProductItem(config, identity.productId, identity.skuId, fetcher)
        : Promise.resolve(null),
      platform === "TIKTOK" && identity
        ? fetchTikTokAffiliateProduct(config, identity.productId, fetcher)
        : Promise.resolve(null),
      requestPartnerProduct(config, platform, normalizedUrl, fetcher),
      platform === "SHOPEE"
        ? requestShopeeItem(config, normalizedUrl, fetcher)
        : Promise.resolve(null),
      requestProductHtml(config, platform, normalizedUrl, fetcher),
    ]);
  const pageData = mergeProductData(nativeProduct, pageProduct);
  const lazadaUrlData =
    platform === "LAZADA" ? parseLazadaUrlProductData(normalizedUrl) : null;
  const lazadaUrlDataWithOriginal =
    lazadaUrlData?.priceVnd !== undefined &&
    lazadaUrlData.originalPriceVnd === undefined &&
    pageData.priceVnd !== undefined &&
    pageData.priceVnd > lazadaUrlData.priceVnd
      ? { ...lazadaUrlData, originalPriceVnd: pageData.priceVnd }
      : lazadaUrlData;
  const officialOffer =
    offerToProductData(openApiOffer) ??
    lazadaItemToProductData(lazadaItem) ??
    tikTokAffiliateToProductData(tikTokProduct);
  const product = mergeProductData(
    lazadaUrlDataWithOriginal,
    mergeProductData(officialOffer, mergeProductData(partner, pageData)),
  );
  const derivedName = deriveProductName(normalizedUrl, platform);

  if (
    !product.productName &&
    !product.imageUrl &&
    product.priceVnd === undefined &&
    !identity &&
    !derivedName
  ) {
    throw new AppError(
      "PRODUCT_NOT_FOUND",
      `Không nhận ra sản phẩm ${platformLabel(platform)} trong link này. Hãy mở đúng trang sản phẩm rồi sao chép lại link.`,
      422,
    );
  }

  const integration = productConfig(config, platform);
  let commissionSource: CommissionSource = "UNAVAILABLE";
  let commissionRateBps = product.commissionRateBps;
  let affiliateCommissionVnd = product.affiliateCommissionVnd;
  if (affiliateCommissionVnd !== undefined) {
    commissionSource = "PARTNER_API";
  } else if (
    product.priceVnd !== undefined &&
    (commissionRateBps ?? integration.defaultCommissionRateBps) > 0
  ) {
    commissionRateBps ??= integration.defaultCommissionRateBps;
    affiliateCommissionVnd = Math.floor(
      (product.priceVnd * commissionRateBps) / 10000,
    );
    commissionSource = "CONFIGURED_RATE";
  }

  const commission =
    affiliateCommissionVnd === undefined ? null : affiliateCommissionVnd;
  const complete =
    Boolean(product.productName ?? derivedName) &&
    Boolean(product.imageUrl) &&
    product.priceVnd !== undefined;
  return {
    platform,
    platformLabel: platformLabel(platform),
    normalizedUrl,
    productId: product.productId ?? identity?.productId ?? null,
    shopId: product.shopId ?? identity?.shopId ?? null,
    productName:
      product.productName ??
      derivedName ??
      `Sản phẩm ${platformLabel(platform)}`,
    shopName: product.shopName ?? null,
    imageUrl: product.imageUrl ?? null,
    priceVnd: product.priceVnd ?? null,
    originalPriceVnd:
      product.originalPriceVnd !== undefined &&
      product.priceVnd !== undefined &&
      product.originalPriceVnd > product.priceVnd
        ? product.originalPriceVnd
        : null,
    affiliateCommissionVnd: commission,
    buyerCashbackVnd: calculateBuyerCashback(
      commission,
      buyerCashbackPercent,
    ),
    buyerCashbackPercent,
    commissionRateBps: commissionRateBps ?? null,
    commissionSource,
    dataStatus: complete ? "COMPLETE" : "PARTIAL",
    estimateOnly: true,
  };
}
