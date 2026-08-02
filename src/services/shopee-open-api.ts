import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";

/**
 * Shopee Affiliate Open Platform — https://open-api.affiliate.shopee.vn/graphql
 *
 * Đây là nguồn dữ liệu chính thức cho affiliate đã được duyệt (cùng cơ chế các
 * nền tảng hoàn tiền như Longhouse dùng):
 * - `productOfferV2`   → tên, ảnh, giá và TỶ LỆ HOA HỒNG sàn trả cho hệ thống.
 * - `generateShortLink`→ link mua đã gắn định danh affiliate + subIds.
 *
 * Xác thực: header `Authorization: SHA256 Credential={AppId}, Timestamp={ts},
 * Signature={sha256(AppId + Timestamp + Payload + Secret)}`.
 */

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

export interface ShopeeProductOffer {
  itemId: string;
  productName?: string;
  imageUrl?: string;
  priceVnd?: number;
  /** Tỷ lệ hoa hồng dạng bps (1/10000), ví dụ 450 = 4,5%. */
  commissionRateBps?: number;
  /** Hoa hồng ước tính (VND) = giá × tỷ lệ, nếu API trả sẵn thì dùng số của API. */
  commissionVnd?: number;
  offerLink?: string;
  productLink?: string;
  shopName?: string;
}

const ENDPOINT = "https://open-api.affiliate.shopee.vn/graphql";

export function isShopeeOpenApiConfigured(config: AppConfig): boolean {
  return Boolean(config.SHOPEE_OPEN_API_APP_ID && config.SHOPEE_OPEN_API_SECRET);
}

export function signShopeePayload(
  appId: string,
  secret: string,
  timestamp: number,
  payload: string,
): string {
  return createHash("sha256")
    .update(`${appId}${timestamp}${payload}${secret}`)
    .digest("hex");
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

/** Giá/hoa hồng API trả dạng chuỗi VND ("125000" hoặc "125000.00"). */
function optionalVnd(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  const rounded = Math.round(parsed);
  return Number.isSafeInteger(rounded) ? rounded : undefined;
}

/** commissionRate là phân số ("0.045" = 4,5%) → đổi sang bps. */
function optionalRateBps(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return undefined;
  return Math.round(parsed * 10000);
}

async function callGraphql(
  config: AppConfig,
  payload: string,
  fetcher: Fetcher,
): Promise<JsonObject | null> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signShopeePayload(
    config.SHOPEE_OPEN_API_APP_ID,
    config.SHOPEE_OPEN_API_SECRET,
    timestamp,
    payload,
  );
  try {
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        authorization: `SHA256 Credential=${config.SHOPEE_OPEN_API_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(config.SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed: unknown = JSON.parse(await response.text());
    const root = asObject(parsed);
    // Lỗi GraphQL (sai field, sai chữ ký, hết hạn mức) trả trong `errors`.
    if (!root || (Array.isArray(root.errors) && root.errors.length > 0)) {
      return null;
    }
    return asObject(root.data);
  } catch {
    return null;
  }
}

export function parseProductOfferPayload(
  data: JsonObject | null,
  itemId: string,
): ShopeeProductOffer | null {
  const offer = asObject(data?.productOfferV2);
  const nodes = Array.isArray(offer?.nodes) ? offer.nodes : [];
  const node =
    nodes.map(asObject).find((candidate) => {
      const candidateId = optionalString(candidate?.itemId);
      return !candidateId || candidateId === itemId;
    }) ?? null;
  if (!node) return null;

  const priceVnd =
    optionalVnd(node.price) ??
    optionalVnd(node.priceMin) ??
    optionalVnd(node.priceMax);
  const commissionRateBps = optionalRateBps(node.commissionRate);
  const commissionVnd =
    optionalVnd(node.commission) ??
    (priceVnd !== undefined && commissionRateBps !== undefined
      ? Math.floor((priceVnd * commissionRateBps) / 10000)
      : undefined);

  const productName = optionalString(node.productName);
  const imageUrl = optionalString(node.imageUrl);
  const offerLink = optionalString(node.offerLink);
  const productLink = optionalString(node.productLink);
  const shopName = optionalString(node.shopName);
  if (!productName && !imageUrl && priceVnd === undefined) return null;

  return {
    itemId,
    ...(productName ? { productName } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(priceVnd !== undefined ? { priceVnd } : {}),
    ...(commissionRateBps !== undefined ? { commissionRateBps } : {}),
    ...(commissionVnd !== undefined ? { commissionVnd } : {}),
    ...(offerLink ? { offerLink } : {}),
    ...(productLink ? { productLink } : {}),
    ...(shopName ? { shopName } : {}),
  };
}

const OFFER_FIELDS_FULL =
  "itemId productName imageUrl price priceMin priceMax commissionRate commission offerLink productLink shopName";
const OFFER_FIELDS_MINIMAL =
  "itemId productName imageUrl price commissionRate offerLink";

export async function fetchShopeeProductOffer(
  config: AppConfig,
  itemId: string,
  fetcher: Fetcher = fetch,
): Promise<ShopeeProductOffer | null> {
  if (!isShopeeOpenApiConfigured(config)) return null;
  if (!/^\d{1,20}$/.test(itemId)) return null;

  // Thử bộ field đầy đủ trước; nếu schema phía Shopee khác (field không tồn
  // tại → GraphQL error) thì lùi về bộ field tối thiểu chắc chắn có.
  for (const fields of [OFFER_FIELDS_FULL, OFFER_FIELDS_MINIMAL]) {
    const payload = JSON.stringify({
      query: `{productOfferV2(itemId: ${itemId}){nodes{${fields}}}}`,
    });
    const data = await callGraphql(config, payload, fetcher);
    const offer = parseProductOfferPayload(data, itemId);
    if (offer) return offer;
    if (data) break; // Có data hợp lệ nhưng không có node → sản phẩm không có offer.
  }
  return null;
}

export async function generateShopeeShortLink(
  config: AppConfig,
  params: { originUrl: string; subIds: string[] },
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  if (!isShopeeOpenApiConfigured(config)) return null;

  const subIds = params.subIds
    .map((value) => value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 50))
    .filter(Boolean)
    .slice(0, 5);
  const payload = JSON.stringify({
    query:
      "mutation ($originUrl: String!, $subIds: [String!]) {generateShortLink(input: {originUrl: $originUrl, subIds: $subIds}){shortLink}}",
    variables: { originUrl: params.originUrl, subIds },
  });
  const data = await callGraphql(config, payload, fetcher);
  const shortLink = optionalString(
    asObject(data?.generateShortLink)?.shortLink,
  );
  return shortLink ?? null;
}
