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

/* ------------------------------------------------------------------ *
 * Feed DANH SÁCH cho trang Khám phá (mục Lazada). Dùng CHUNG endpoint
 * /marketing/product/feed nhưng KHÔNG lọc productIds → trả cả trang sản phẩm
 * affiliate (hoa hồng thật). API không có tham số sort nên "hot" (hoa hồng
 * cao) / "best" (bán chạy 7 ngày) do phía server sắp xếp lại trong trang.
 * ------------------------------------------------------------------ */

export interface LazadaOfferProduct {
  itemId: string;
  name: string;
  imageUrl: string | null;
  priceVnd: number | null;
  commissionRateBps: number | null;
  commissionVnd: number | null;
  shopName: string | null;
  productUrl: string;
  salesCount: number | null;
}

/** URL sản phẩm chỉ cần mang itemId để preview/purchase tách ra được. */
function lazadaProductUrl(itemId: string): string {
  return `https://www.lazada.vn/products/p-i${itemId}.html`;
}

function mapFeedItemToOffer(item: JsonObject): LazadaOfferProduct | null {
  const itemId = optionalString(item.productId);
  const name = optionalString(item.productName);
  if (!itemId || !name) return null;
  const images = Array.isArray(item.pictures) ? item.pictures : [];
  const sales = Number(item.sales7d);
  return {
    itemId,
    name,
    imageUrl: optionalString(images[0]) ?? null,
    priceVnd: optionalVnd(item.discountPrice) ?? null,
    commissionRateBps: fractionToBps(item.totalCommissionRate) ?? null,
    commissionVnd: optionalVnd(item.totalCommissionAmount) ?? null,
    shopName: optionalString(item.sellerName) ?? null,
    productUrl: lazadaProductUrl(itemId),
    salesCount: Number.isFinite(sales) && sales >= 0 ? Math.floor(sales) : null,
  };
}

export function parseLazadaOfferFeed(payload: unknown): LazadaOfferProduct[] {
  const root = asObject(payload);
  if (!root || (root.code !== "0" && root.code !== 0)) return [];
  const result = asObject(root.result);
  const data = Array.isArray(result?.data) ? result!.data : [];
  const out: LazadaOfferProduct[] = [];
  for (const entry of data) {
    const obj = asObject(entry);
    if (!obj) continue;
    const mapped = mapFeedItemToOffer(obj);
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Lấy MỘT trang feed affiliate (offerType=1). categoryL1 lọc theo danh mục. */
export async function fetchLazadaOfferPage(
  config: AppConfig,
  opts: { page: number; limit: number; categoryL1?: number },
  fetcher: Fetcher = fetch,
): Promise<LazadaOfferProduct[]> {
  if (!isLazadaAffiliateConfigured(config)) return [];
  const page = Math.min(Math.max(Math.trunc(opts.page) || 1, 1), 100);
  const limit = Math.min(Math.max(Math.trunc(opts.limit) || 20, 1), 50);

  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    offerType: "1",
    userToken: config.LAZADA_AFFILIATE_USER_TOKEN,
    page: String(page),
    limit: String(limit),
  };
  if (opts.categoryL1 && opts.categoryL1 > 0) {
    params.categoryL1 = String(Math.trunc(opts.categoryL1));
  }
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
    if (!response.ok) return [];
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 4 * 1024 * 1024) return [];
    return parseLazadaOfferFeed(JSON.parse(text));
  } catch {
    return [];
  }
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

const REPORT_PATH = "/marketing/conversion/report";

export interface LazadaConversionOrder {
  orderId: string;
  subOrderId?: string;
  /** Trạng thái đơn thô của Lazada (Fulfilled/Pending/Cancelled/Returned...). */
  status: string;
  itemId?: string;
  productName?: string;
  orderAmountVnd?: number;
  /** Hoa hồng dự chi của affiliate (VND). */
  payoutVnd?: number;
  /** subId1 gắn khi tạo link — thường u<tracking_code>. */
  subId1?: string;
  /** Thời điểm đặt đơn (ISO), suy từ conversionTime. */
  conversionTime?: string;
  fulfilledTime?: string;
}

/** Lấy itemId từ pdpUrl Lazada (…/pdp-i<itemId>-s<skuId>.html). */
function itemIdFromPdp(url: unknown): string | undefined {
  const s = optionalString(url);
  return s ? (s.match(/-i(\d{3,})/)?.[1] ?? undefined) : undefined;
}

export function parseLazadaConversionReport(
  payload: unknown,
): LazadaConversionOrder[] {
  const root = asObject(payload);
  const data = asObject(root?.result)?.data ?? root?.data;
  const list = Array.isArray(data) ? data : [];
  const orders: LazadaConversionOrder[] = [];
  for (const raw of list) {
    const o = asObject(raw);
    if (!o) continue;
    const orderId = optionalString(o.orderId ?? o.subOrderId);
    if (!orderId) continue;
    orders.push({
      orderId,
      ...(optionalString(o.subOrderId)
        ? { subOrderId: optionalString(o.subOrderId)! }
        : {}),
      status: optionalString(o.status) ?? "PENDING",
      ...(itemIdFromPdp(o.pdpUrl) ? { itemId: itemIdFromPdp(o.pdpUrl)! } : {}),
      ...(optionalString(o.skuName)
        ? { productName: optionalString(o.skuName)! }
        : {}),
      ...(optionalVnd(o.orderAmt) !== undefined
        ? { orderAmountVnd: optionalVnd(o.orderAmt)! }
        : {}),
      ...(optionalVnd(o.estPayout) !== undefined
        ? { payoutVnd: optionalVnd(o.estPayout)! }
        : {}),
      ...(optionalString(o.subId1) ? { subId1: optionalString(o.subId1)! } : {}),
      ...(optionalString(o.conversionTime)
        ? { conversionTime: optionalString(o.conversionTime)! }
        : {}),
      ...(optionalString(o.fulfilledTime)
        ? { fulfilledTime: optionalString(o.fulfilledTime)! }
        : {}),
    });
  }
  return orders;
}

/**
 * Lấy MỘT trang báo cáo chuyển đổi Lazada. LƯU Ý: API chỉ cho phép khoảng
 * `dateStart`–`dateEnd` NẰM TRONG CÙNG MỘT THÁNG LỊCH (format YYYY-MM-DD).
 */
export async function fetchLazadaConversionReport(
  config: AppConfig,
  opts: { dateStart: string; dateEnd: string; page?: number; limit?: number },
  fetcher: Fetcher = fetch,
): Promise<LazadaConversionOrder[]> {
  if (!isLazadaAffiliateConfigured(config)) return [];
  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    userToken: config.LAZADA_AFFILIATE_USER_TOKEN,
    dateStart: opts.dateStart,
    dateEnd: opts.dateEnd,
    page: String(Math.max(1, Math.trunc(opts.page ?? 1))),
    limit: String(Math.min(Math.max(Math.trunc(opts.limit ?? 100), 1), 100)),
  };
  const sign = signLazadaRequest(
    REPORT_PATH,
    params,
    config.LAZADA_OPEN_API_APP_SECRET,
  );
  const endpoint = new URL(`${BASE_URL}${REPORT_PATH}`);
  for (const [key, value] of Object.entries(params)) {
    endpoint.searchParams.set(key, value);
  }
  endpoint.searchParams.set("sign", sign);

  const response = await fetcher(endpoint, {
    redirect: "error",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Lazada report HTTP ${response.status}`);
  }
  const json = JSON.parse(await response.text()) as JsonObject;
  if (asObject(json.result)?.success !== true && json.code !== "0") {
    throw new Error(
      `Lazada report lỗi: ${optionalString(json.message) ?? "không rõ"}`,
    );
  }
  return parseLazadaConversionReport(json);
}

const LINK_PATH = "/marketing/product/link";

export interface LazadaAffiliateLink {
  trackingLink: string;
  productName?: string;
  commissionRateBps?: number;
}

/**
 * Sinh link Affiliate Lazada CHÍNH THỨC qua Open API `/marketing/product/link`
 * (chỉ cần productId + userToken, KHÔNG cần cookie/profile). Trả link rút gọn
 * s.lazada.vn đã gắn tài khoản affiliate (click tự tính về tài khoản), kèm tên
 * sản phẩm + tỷ lệ hoa hồng. Đây là đường tạo link ưu tiên; các đường
 * cookie/profile/Master Link chỉ là dự phòng.
 */
export async function fetchLazadaAffiliateLink(
  config: AppConfig,
  itemId: string,
  fetcher: Fetcher = fetch,
  /** subId1 gắn vào link (thường u<tracking_code>) để đối soát người mua qua báo cáo. */
  subId1?: string,
): Promise<LazadaAffiliateLink | null> {
  if (!isLazadaAffiliateConfigured(config)) return null;
  if (!/^\d{1,20}$/.test(itemId)) return null;

  const cleanSubId = subId1
    ? subId1.replace(/[^a-zA-Z0-9]/g, "").slice(0, 50)
    : "";
  const params: Record<string, string> = {
    app_key: config.LAZADA_OPEN_API_APP_KEY,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    userToken: config.LAZADA_AFFILIATE_USER_TOKEN,
    productId: itemId,
    ...(cleanSubId ? { subId1: cleanSubId } : {}),
  };
  const sign = signLazadaRequest(
    LINK_PATH,
    params,
    config.LAZADA_OPEN_API_APP_SECRET,
  );
  const endpoint = new URL(`${BASE_URL}${LINK_PATH}`);
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
    const json = JSON.parse(await response.text()) as JsonObject;
    const data = asObject(asObject(json.result)?.data);
    const trackingLink = optionalString(data?.trackingLink);
    if (!trackingLink) return null;
    return {
      trackingLink,
      ...(optionalString(data?.productName)
        ? { productName: optionalString(data?.productName)! }
        : {}),
      ...(fractionToBps(data?.commisionRate) !== undefined
        ? { commissionRateBps: fractionToBps(data?.commisionRate)! }
        : {}),
    };
  } catch {
    return null;
  }
}
