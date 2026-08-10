import { AppError } from "../lib/errors.js";

/**
 * Đọc báo cáo chuyển đổi (Conversion Report) của Shopee Affiliate.
 *
 * Shopee chưa mở endpoint báo cáo đơn trong Open API, nên hệ thống dùng đúng
 * API mà trang affiliate.shopee.vn gọi, kèm cookie phiên đăng nhập do admin
 * cấu hình. Toàn bộ số tiền trong báo cáo được nhân sẵn 100.000 lần
 * (19850000000 = 198.500đ) nên phải chia lại theo `SHOPEE_AMOUNT_SCALE`.
 */

export const SHOPEE_REPORT_API_URL =
  "https://affiliate.shopee.vn/api/v3/report/list";
export const SHOPEE_AMOUNT_SCALE = 100_000;
export const SHOPEE_REPORT_MAX_PAGE_SIZE = 100;
const SHOPEE_IMAGE_BASE = "https://down-vn.img.susercontent.com/file/";

type Fetcher = typeof fetch;
type JsonObject = Record<string, unknown>;

export interface ShopeeReportPage {
  code: number;
  msg: string;
  data: {
    page_num: number;
    page_size: number;
    total_count: number;
    list: unknown[];
  };
}

export interface ShopeeReportFetchOptions {
  purchaseTimeStart: number;
  purchaseTimeEnd: number;
  pageSize?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export interface ShopeeReportResult {
  totalCount: number;
  list: unknown[];
}

export type ShopeeOrderStatus =
  | "PENDING"
  | "APPROVED"
  | "INVALID"
  | "CANCELLED";

export interface ShopeeSyncOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  amountVnd: number;
  imageUrl: string | null;
}

export interface ShopeeSyncOrder {
  orderSn: string;
  subId: string;
  status: ShopeeOrderStatus;
  externalStatus: string;
  cancelReason: string | null;
  orderAmountVnd: number;
  commissionVnd: number;
  purchasedAt: string | null;
  completedAt: string | null;
  items: ShopeeSyncOrderItem[];
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function numberOf(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0;
}

/** Quy đổi số tiền "micro" của Shopee về VND nguyên, luôn làm tròn xuống. */
export function shopeeAmountToVnd(value: unknown): number {
  const amount = Math.floor(numberOf(value) / SHOPEE_AMOUNT_SCALE);
  return amount > 0 && Number.isSafeInteger(amount) ? amount : 0;
}

function secondsToIso(value: unknown): string | null {
  const seconds = numberOf(value);
  if (seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Shopee trả id lúc là số (item_id), lúc là chuỗi (model_id). */
function idOf(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return stringOf(value);
}

/**
 * Tách chuỗi cookie từ nội dung admin dán vào: chấp nhận cả dạng "cookie: ..."
 * copy từ DevTools lẫn chuỗi cookie thuần.
 */
export function extractShopeeCookie(contents: string): string {
  const trimmed = contents.trim();
  const cookieHeader = trimmed.match(/(?:^|\r?\n)cookie\s*:\s*(.+)$/im)?.[1];
  const cookie = (cookieHeader ?? trimmed).replace(/\s*\r?\n\s*/g, " ").trim();
  if (!cookie.includes("=")) {
    throw new AppError(
      "SHOPEE_COOKIE_INVALID",
      "Cookie Shopee không hợp lệ. Hãy dán nguyên chuỗi cookie của affiliate.shopee.vn.",
    );
  }
  return cookie;
}

function assertReportPage(value: unknown): asserts value is ShopeeReportPage {
  const page = value as Partial<ShopeeReportPage> | null;
  if (
    !page ||
    typeof page !== "object" ||
    page.code !== 0 ||
    !page.data ||
    !Array.isArray(page.data.list) ||
    !Number.isInteger(page.data.total_count)
  ) {
    const message = typeof page?.msg === "string" ? ` (${page.msg})` : "";
    throw new AppError(
      "SHOPEE_REPORT_INVALID",
      `Shopee trả dữ liệu báo cáo không hợp lệ${message}. Cookie có thể đã hết hạn.`,
      502,
    );
  }
}

export async function fetchShopeeReportPage(
  cookie: string,
  options: ShopeeReportFetchOptions,
  pageNum: number,
  fetcher: Fetcher = fetch,
): Promise<ShopeeReportPage> {
  const url = new URL(SHOPEE_REPORT_API_URL);
  url.search = new URLSearchParams({
    page_size: String(options.pageSize ?? SHOPEE_REPORT_MAX_PAGE_SIZE),
    page_num: String(pageNum),
    purchase_time_s: String(options.purchaseTimeStart),
    purchase_time_e: String(options.purchaseTimeEnd),
    version: "1",
  }).toString();

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "vi-VN,vi;q=0.9,en-US;q=0.6,en;q=0.5",
        "affiliate-program-type": "1",
        cookie,
        referer: "https://affiliate.shopee.vn/report/conversion_report",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
  } catch {
    throw new AppError(
      "SHOPEE_REPORT_UNAVAILABLE",
      "Không kết nối được tới báo cáo Shopee Affiliate. Hãy thử lại sau.",
      503,
    );
  }
  if (!response.ok) {
    throw new AppError(
      "SHOPEE_REPORT_REJECTED",
      `Shopee từ chối yêu cầu báo cáo (HTTP ${response.status}). Cookie có thể đã hết hạn.`,
      502,
    );
  }

  const body: unknown = await response.json();
  assertReportPage(body);
  return body;
}

/** Tải toàn bộ các trang báo cáo trong khoảng thời gian yêu cầu. */
export async function fetchShopeeReport(
  cookie: string,
  options: ShopeeReportFetchOptions,
  fetcher: Fetcher = fetch,
): Promise<ShopeeReportResult> {
  if (options.purchaseTimeStart >= options.purchaseTimeEnd) {
    throw new AppError(
      "SHOPEE_REPORT_RANGE_INVALID",
      "Khoảng thời gian lấy báo cáo không hợp lệ.",
    );
  }
  const pageSize = Math.min(
    options.pageSize ?? SHOPEE_REPORT_MAX_PAGE_SIZE,
    SHOPEE_REPORT_MAX_PAGE_SIZE,
  );
  const firstPage = await fetchShopeeReportPage(
    cookie,
    { ...options, pageSize },
    1,
    fetcher,
  );
  const list = [...firstPage.data.list];
  const totalPages = Math.min(
    Math.max(1, Math.ceil(firstPage.data.total_count / pageSize)),
    options.maxPages ?? 50,
  );

  for (let pageNum = 2; pageNum <= totalPages; pageNum += 1) {
    const page = await fetchShopeeReportPage(
      cookie,
      { ...options, pageSize },
      pageNum,
      fetcher,
    );
    list.push(...page.data.list);
  }
  return { totalCount: firstPage.data.total_count, list };
}

/**
 * Ánh xạ trạng thái đơn của Shopee về trạng thái nội bộ:
 * - COMPLETED  → APPROVED  (đơn Hoàn thành, bắt đầu đếm ngày giữ tiền)
 * - CANCEL/... → CANCELLED (đơn đã hủy, đảo khoản hoàn nếu đã ghi nhận)
 * - còn lại    → PENDING   (đang duyệt, tiếp tục hỏi lại ở lần đồng bộ sau)
 */
function mapOrderStatus(
  orderStatus: string,
  itemStatuses: readonly string[],
): ShopeeOrderStatus {
  const normalized = orderStatus.toUpperCase();
  if (normalized === "COMPLETED") return "APPROVED";
  if (["CANCEL", "CANCELLED", "CANCELED"].includes(normalized)) {
    return "CANCELLED";
  }
  if (["INVALID", "REJECTED", "FRAUD"].includes(normalized)) return "INVALID";
  if (
    itemStatuses.length > 0 &&
    itemStatuses.every((status) => status.toUpperCase() === "CANCEL")
  ) {
    return "CANCELLED";
  }
  return "PENDING";
}

function parseItems(value: unknown): ShopeeSyncOrderItem[] {
  if (!Array.isArray(value)) return [];
  const items: ShopeeSyncOrderItem[] = [];
  for (const raw of value) {
    const item = asObject(raw);
    if (!item) continue;
    const itemName = stringOf(item.item_name);
    const itemId = idOf(item.item_id) || idOf(item.model_id);
    if (!itemName && !itemId) continue;
    const imgCode = stringOf(item.img_code);
    // Đơn hủy có actual_amount = 0; vẫn giữ giá niêm yết để người dùng nhận ra
    // sản phẩm trong lịch sử đơn hàng.
    const amountVnd =
      shopeeAmountToVnd(item.actual_amount) || shopeeAmountToVnd(item.item_price);
    items.push({
      itemId: itemId || itemName.slice(0, 64),
      itemName: itemName || `Sản phẩm ${itemId}`,
      quantity: Math.max(1, Math.trunc(numberOf(item.qty))),
      amountVnd,
      imageUrl: imgCode ? `${SHOPEE_IMAGE_BASE}${imgCode}` : null,
    });
  }
  return items;
}

/**
 * Chuyển danh sách checkout thô của báo cáo thành từng đơn hàng chuẩn hóa.
 * Một checkout có thể chứa nhiều đơn (order_sn), hoa hồng được cộng theo
 * từng mặt hàng của chính đơn đó nên không bị lẫn giữa các đơn cùng checkout.
 */
export function parseShopeeReportOrders(list: unknown[]): ShopeeSyncOrder[] {
  const orders: ShopeeSyncOrder[] = [];
  for (const rawCheckout of list) {
    const checkout = asObject(rawCheckout);
    if (!checkout) continue;
    const subId = stringOf(checkout.utm_content);
    const purchasedAt = secondsToIso(checkout.purchase_time);
    const checkoutOrders = Array.isArray(checkout.orders)
      ? checkout.orders
      : [];

    for (const rawOrder of checkoutOrders) {
      const order = asObject(rawOrder);
      if (!order) continue;
      const orderSn = idOf(order.order_sn) || idOf(order.order_id);
      if (!orderSn) continue;

      const rawItems = Array.isArray(order.items) ? order.items : [];
      const itemStatuses = rawItems
        .map((item) => stringOf(asObject(item)?.item_status))
        .filter(Boolean);
      const status = mapOrderStatus(stringOf(order.order_status), itemStatuses);

      let orderAmountVnd = 0;
      let commissionVnd = 0;
      for (const rawItem of rawItems) {
        const item = asObject(rawItem);
        if (!item) continue;
        orderAmountVnd += shopeeAmountToVnd(item.actual_amount);
        commissionVnd +=
          shopeeAmountToVnd(item.item_commission) +
          shopeeAmountToVnd(item.capped_brand_commission);
      }

      const completedAt =
        status === "APPROVED" ? secondsToIso(order.complete_time) : null;
      const cancelReason = stringOf(order.cancel_reason);
      orders.push({
        orderSn,
        subId,
        status,
        externalStatus: stringOf(order.order_status) || "UNKNOWN",
        cancelReason: cancelReason || null,
        orderAmountVnd,
        // Đơn hủy/không hợp lệ không được mang theo hoa hồng ước tính.
        commissionVnd:
          status === "CANCELLED" || status === "INVALID" ? 0 : commissionVnd,
        purchasedAt,
        completedAt,
        items: parseItems(order.items),
      });
    }
  }
  return orders;
}
