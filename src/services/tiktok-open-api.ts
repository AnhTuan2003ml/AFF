import { createHmac } from "node:crypto";
import type { AppConfig } from "../config.js";

/**
 * TikTok Shop Affiliate Creator API — https://open-api.tiktokglobalshop.com
 *
 * Đây là nhóm API dành cho Creator/Affiliate, không phải Seller API. App phải
 * được TikTok duyệt quyền Affiliate Creator và access token phải được cấp bởi
 * chính tài khoản creator qua luồng ủy quyền của Partner Center.
 */

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

export interface TikTokAffiliateProduct {
  productId: string;
  productName?: string;
  imageUrl?: string;
  priceVnd?: number;
  originalPriceVnd?: number;
  /** Tỷ lệ hoa hồng theo basis points: 1800 = 18%. */
  commissionRateBps?: number;
}

export interface TikTokSharingLinkParams {
  productId: string;
  campaignId?: string;
}

const BASE_URL = "https://open-api.tiktokglobalshop.com";
const PRODUCT_LOOKUP_PATH =
  "/affiliate_creator/202509/open_collaborations/products";
const SHARING_LINK_PATH =
  "/affiliate_creator/202505/affiliate_sharing_links/general_publishers/generate_batch";
const TIKTOK_REDIRECT_HOSTS = new Set([
  "tiktok.com",
  "www.tiktok.com",
  "shop.tiktok.com",
  "vt.tiktok.com",
  "vm.tiktok.com",
]);

export function isTikTokOpenApiConfigured(config: AppConfig): boolean {
  return Boolean(
    config.TIKTOK_OPEN_API_APP_KEY &&
      config.TIKTOK_OPEN_API_APP_SECRET &&
      config.TIKTOK_OPEN_API_ACCESS_TOKEN,
  );
}

/**
 * Chữ ký TikTok Shop Open API: HMAC-SHA256 của
 * `secret + path + sortedParams(key+value, bỏ access_token/sign) + body + secret`.
 */
export function signTikTokRequest(params: {
  path: string;
  query: Record<string, string>;
  body?: string;
  appSecret: string;
}): string {
  const sortedKeys = Object.keys(params.query).sort();
  const paramString = sortedKeys.reduce(
    (acc, key) => `${acc}${key}${params.query[key]}`,
    "",
  );
  const base = `${params.appSecret}${params.path}${paramString}${params.body ?? ""}${params.appSecret}`;
  return createHmac("sha256", params.appSecret)
    .update(base, "utf8")
    .digest("hex");
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

function optionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function moneyAmount(value: unknown): { amount?: number; currency?: string } {
  const node = asObject(value);
  if (!node) {
    const amount = optionalNumber(value);
    return amount === undefined ? {} : { amount };
  }
  const amount = optionalNumber(
    node.amount ??
      node.value ??
      node.minimum_amount ??
      node.maximum_amount ??
      node.price,
  );
  const currency = optionalString(node.currency ?? node.currency_code);
  return {
    ...(amount === undefined ? {} : { amount }),
    ...(currency ? { currency } : {}),
  };
}

function optionalVnd(value: unknown): number | undefined {
  const money = moneyAmount(value);
  if (money.amount === undefined) return undefined;
  if (money.currency && money.currency.toUpperCase() !== "VND") return undefined;
  const rounded = Math.round(money.amount);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

function optionalRateBps(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  if (parsed <= 1) return Math.round(parsed * 10000);
  // Một số partner cũ trả phần trăm (18), API Creator mới thường trả
  // hundredths of a percent (1800). Giữ tương thích cả hai dạng.
  if (parsed <= 100) return Math.round(parsed * 100);
  return Math.round(parsed);
}

function firstImageUrl(node: JsonObject): string | undefined {
  const mainImage = asObject(node.main_image ?? node.mainImage);
  const images = Array.isArray(node.images) ? node.images : [];
  for (const candidate of [
    mainImage?.url,
    mainImage?.url_list,
    node.main_image_url,
    node.image_url,
    node.image,
    images[0],
  ]) {
    if (Array.isArray(candidate)) {
      const nested = candidate.map(optionalString).find(Boolean);
      if (nested) return nested;
      continue;
    }
    const objectCandidate = asObject(candidate);
    const value = optionalString(
      objectCandidate?.url ?? objectCandidate?.image_url ?? candidate,
    );
    if (value) return value;
  }
  return undefined;
}

function firstPrice(node: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = optionalVnd(node[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function parseTikTokProductPayload(
  payload: unknown,
  productId: string,
): TikTokAffiliateProduct | null {
  const root = asObject(payload);
  if (!root) return null;
  if (root.code !== undefined && root.code !== 0 && root.code !== "0") {
    return null;
  }
  const data = asObject(root.data) ?? root;
  const products = Array.isArray(data.products)
    ? data.products
    : Array.isArray(data.product_list)
      ? data.product_list
      : [];
  const node =
    products
      .map(asObject)
      .find(
        (candidate) =>
          optionalString(
            candidate?.id ?? candidate?.product_id ?? candidate?.productId,
          ) === productId,
      ) ?? asObject(products[0]) ?? data;
  if (!node) return null;

  const productName = optionalString(
    node.title ?? node.product_name ?? node.productName ?? node.name,
  );
  const imageUrl = firstImageUrl(node);
  const priceVnd = firstPrice(node, [
    "sale_price",
    "salePrice",
    "price",
    "minimum_price",
    "min_price",
  ]);
  const listPriceVnd = firstPrice(node, [
    "original_price",
    "originalPrice",
    "list_price",
  ]);
  const originalPriceVnd =
    listPriceVnd !== undefined &&
    priceVnd !== undefined &&
    listPriceVnd > priceVnd
      ? listPriceVnd
      : undefined;
  const commission = asObject(
    node.commission ?? node.creator_commission ?? node.commission_info,
  );
  const commissionRateBps = optionalRateBps(
    node.commission_rate ??
      node.commissionRate ??
      commission?.rate ??
      commission?.commission_rate,
  );

  if (!productName && !imageUrl && priceVnd === undefined) return null;
  return {
    productId,
    ...(productName ? { productName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(originalPriceVnd !== undefined ? { originalPriceVnd } : {}),
    ...(commissionRateBps !== undefined ? { commissionRateBps } : {}),
  };
}

export function parseTikTokProductId(input: string): string | null {
  try {
    const url = new URL(input);
    const pathMatch = url.pathname.match(
      /\/(?:view\/product|product)\/(\d+)(?:\/|$)/i,
    );
    const productId =
      pathMatch?.[1] ??
      url.searchParams.get("product_id") ??
      url.searchParams.get("productId");
    return productId && /^\d{1,30}$/.test(productId) ? productId : null;
  } catch {
    return null;
  }
}

function isSafeTikTokSharingLink(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      TIKTOK_REDIRECT_HOSTS.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function findSharingLink(payload: unknown): string | undefined {
  const root = asObject(payload);
  if (!root) return undefined;
  if (root.code !== undefined && root.code !== 0 && root.code !== "0") {
    return undefined;
  }
  const data = asObject(root.data) ?? root;
  const collections = [
    data.sharing_links,
    data.affiliate_sharing_links,
    data.links,
    data.results,
    root.sharing_links,
    root.affiliate_sharing_links,
  ];
  const nodes = collections
    .filter(Array.isArray)
    .flatMap((value) => value as unknown[])
    .map(asObject)
    .filter((value): value is JsonObject => Boolean(value));
  const directNodes = [data, ...nodes];
  for (const node of directNodes) {
    const nested = asObject(
      node.sharing_link ??
        node.share_link ??
        node.affiliate_sharing_link ??
        node.affiliate_link,
    );
    const candidates = [
      node.sharing_link,
      node.share_link,
      node.affiliate_sharing_link,
      node.affiliate_link,
      node.promotion_link,
      node.url,
      node.link,
      nested?.url,
      nested?.link,
      nested?.sharing_link,
      nested?.affiliate_sharing_link,
    ];
    const link = candidates.map(optionalString).find(
      (candidate): candidate is string =>
        Boolean(candidate && isSafeTikTokSharingLink(candidate)),
    );
    if (link) return link;
  }
  return undefined;
}

async function callTikTokPost(
  config: AppConfig,
  path: string,
  query: Record<string, string>,
  body: string,
  fetcher: Fetcher,
): Promise<unknown | null> {
  const sign = signTikTokRequest({
    path,
    query,
    body,
    appSecret: config.TIKTOK_OPEN_API_APP_SECRET,
  });
  const endpoint = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    endpoint.searchParams.set(key, value);
  }
  endpoint.searchParams.set("sign", sign);

  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-tts-access-token": config.TIKTOK_OPEN_API_ACCESS_TOKEN,
      },
      body,
      signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function fetchTikTokAffiliateProduct(
  config: AppConfig,
  productId: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokAffiliateProduct | null> {
  if (!isTikTokOpenApiConfigured(config)) return null;
  if (!/^\d{1,30}$/.test(productId)) return null;

  const query: Record<string, string> = {
    app_key: config.TIKTOK_OPEN_API_APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
    product_ids: productId,
  };
  const body = "{}";
  const payload = await callTikTokPost(
    config,
    PRODUCT_LOOKUP_PATH,
    query,
    body,
    fetcher,
  );
  return payload ? parseTikTokProductPayload(payload, productId) : null;
}

export async function generateTikTokAffiliateSharingLink(
  config: AppConfig,
  params: TikTokSharingLinkParams,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  if (!isTikTokOpenApiConfigured(config)) return null;
  if (!/^\d{1,30}$/.test(params.productId)) return null;

  const query: Record<string, string> = {
    app_key: config.TIKTOK_OPEN_API_APP_KEY,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const body = JSON.stringify({
    material: {
      ids: [params.productId],
      type: "PRODUCT",
    },
    ...(params.campaignId ? { campaign_id: params.campaignId } : {}),
    link_type: "",
  });
  const payload = await callTikTokPost(
    config,
    SHARING_LINK_PATH,
    query,
    body,
    fetcher,
  );
  return payload ? (findSharingLink(payload) ?? null) : null;
}
