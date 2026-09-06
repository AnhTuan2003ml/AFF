import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { releaseDueCashback } from "./cashback-release.js";
import {
  fetchLazadaConversionReport,
  isLazadaAffiliateConfigured,
  type LazadaConversionOrder,
} from "./lazada-affiliate-api.js";
import { importOrderRow, type OrderImportRow } from "./order-import.js";

type Fetcher = typeof fetch;

export interface LazadaSyncSummary {
  fetched: number;
  imported: number;
  skipped: number;
  failed: number;
  releasedOrders: number;
  failures: string[];
}

/** Đơn không gắn được người mua là bình thường (tài khoản nhận đơn từ kênh khác). */
const SKIPPABLE_ERROR_CODES = new Set([
  "ORDER_TRACKING_NOT_FOUND",
  "ORDER_OWNER_NOT_FOUND",
  "SHARED_LINK_BUYER_NOT_VERIFIABLE",
  "SHOPEE_TRACKING_REQUIRED",
]);

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "YYYY-MM-DD" theo giờ VN. */
function vnDate(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** "yyyy-MM-dd HH:mm:ss" (giờ VN) → ISO có offset +07:00. */
function lazadaTimeToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = value.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+07:00`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/**
 * Trạng thái đơn Lazada → nội bộ. Lazada dùng nhiều nhãn tuỳ phiên bản
 * (Fulfilled/Delivered/Pending/Cancelled/Returned/Invalid); map theo từ khoá,
 * mặc định PENDING để lượt sau hỏi lại. Tinh chỉnh khi có đơn thật.
 */
function mapLazadaStatus(
  raw: string,
): "APPROVED" | "CANCELLED" | "PENDING" | "INVALID" {
  const s = raw.toLowerCase();
  if (/invalid|reject|fraud/.test(s)) return "INVALID";
  if (/cancel|return|refund/.test(s)) return "CANCELLED";
  if (/fulfil|deliver|complete|confirm|paid|valid/.test(s)) return "APPROVED";
  return "PENDING";
}

function toOrderImportRow(order: LazadaConversionOrder): OrderImportRow {
  // sub_id ghép "u<code>-p<itemId>" để resolveUser đối soát theo user + sản phẩm.
  const subParts = [
    order.subId1,
    order.itemId ? `p${order.itemId}` : "",
  ].filter(Boolean);
  const purchasedAt = lazadaTimeToIso(order.conversionTime);
  const completedAt = lazadaTimeToIso(order.fulfilledTime);
  return {
    platform: "LAZADA",
    platform_order_id: order.subOrderId || order.orderId,
    status: mapLazadaStatus(order.status),
    order_amount_vnd: String(order.orderAmountVnd ?? 0),
    commission_vnd: String(order.payoutVnd ?? 0),
    external_status: order.status,
    ...(subParts.length ? { sub_id: subParts.join("-") } : {}),
    ...(purchasedAt ? { purchased_at: purchasedAt } : {}),
    ...(completedAt ? { completed_at: completedAt } : {}),
    ...(order.itemId
      ? {
          items: [
            {
              item_id: order.itemId,
              item_name: order.productName ?? "",
              quantity: 1,
              amount_vnd: order.orderAmountVnd ?? 0,
            },
          ],
        }
      : {}),
  };
}

/** Các khoảng [start,end] YYYY-MM-DD của tháng này + tháng trước (giờ VN). */
function monthRanges(now: Date): Array<{ start: string; end: string }> {
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const y = vnNow.getUTCFullYear();
  const mo = vnNow.getUTCMonth(); // 0-based
  const firstThis = new Date(Date.UTC(y, mo, 1));
  const firstPrev = new Date(Date.UTC(y, mo - 1, 1));
  const lastPrev = new Date(Date.UTC(y, mo, 0)); // ngày 0 tháng này = cuối tháng trước
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [
    { start: iso(firstPrev), end: iso(lastPrev) },
    { start: iso(firstThis), end: vnDate(now) },
  ];
}

/**
 * Đối soát đơn Lazada từ báo cáo chuyển đổi Open API (/marketing/conversion/report).
 * Với mỗi đơn: map subId1 (u<tracking_code>) → người mua, đổ vào importOrderRow
 * (ghi ví CHỜ, hẹn giải ngân với đơn Hoàn thành, đảo khoản với đơn hủy). Cuối
 * lượt giải ngân các đơn đã qua thời gian giữ tiền. Quét THÁNG NÀY + THÁNG TRƯỚC
 * vì API chỉ cho lấy trong cùng một tháng lịch mỗi lần.
 */
export async function runLazadaOrderSync(
  db: Database,
  config: AppConfig,
  options: { actorId: string; fetcher?: Fetcher },
): Promise<LazadaSyncSummary> {
  if (!isLazadaAffiliateConfigured(config)) {
    throw new AppError(
      "LAZADA_AFFILIATE_NOT_CONFIGURED",
      "Chưa cấu hình Lazada Open API (App Key/Secret/User Token).",
    );
  }
  const fetcher = options.fetcher ?? fetch;
  const summary: LazadaSyncSummary = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    releasedOrders: 0,
    failures: [],
  };

  for (const range of monthRanges(new Date())) {
    for (let page = 1; page <= 50; page += 1) {
      const orders = await fetchLazadaConversionReport(
        config,
        { dateStart: range.start, dateEnd: range.end, page, limit: 100 },
        fetcher,
      );
      summary.fetched += orders.length;
      for (const order of orders) {
        try {
          await importOrderRow(
            db,
            config,
            toOrderImportRow(order),
            options.actorId,
          );
          summary.imported += 1;
        } catch (error) {
          const appError = error instanceof AppError ? error : null;
          if (appError && SKIPPABLE_ERROR_CODES.has(appError.code)) {
            summary.skipped += 1;
            continue;
          }
          summary.failed += 1;
          if (summary.failures.length < 20) {
            summary.failures.push(
              `Đơn ${order.orderId}: ${appError?.message ?? "Lỗi không xác định"}`,
            );
          }
        }
      }
      if (orders.length < 100) break; // hết trang của khoảng này
    }
  }

  const release = await releaseDueCashback(db, { actorId: options.actorId });
  summary.releasedOrders = release.released;
  return summary;
}
