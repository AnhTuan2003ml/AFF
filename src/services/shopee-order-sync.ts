import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { releaseDueCashback } from "./cashback-release.js";
import {
  getPlatformSyncSettings,
  getShopeeCookie,
  recordShopeeSyncRun,
  type SyncRunOutcome,
} from "./platform-sync-settings.js";
import {
  fetchShopeeReport,
  parseShopeeReportOrders,
  type ShopeeSyncOrder,
} from "./shopee-report.js";
import { importOrderRow, type OrderImportRow } from "./order-import.js";

type Fetcher = typeof fetch;

export interface ShopeeSyncSummary {
  fetched: number;
  imported: number;
  skipped: number;
  failed: number;
  releasedOrders: number;
  releasedAmountVnd: number;
  failures: string[];
}

/**
 * Đơn chưa gắn được với người dùng nào là chuyện bình thường: tài khoản
 * Affiliate còn nhận đơn từ các kênh khác ngoài ShopTik. Những lỗi này chỉ
 * được đếm là "bỏ qua", không tính là lỗi đồng bộ.
 */
const SKIPPABLE_ERROR_CODES = new Set([
  "ORDER_TRACKING_NOT_FOUND",
  "ORDER_OWNER_NOT_FOUND",
  "SHOPEE_TRACKING_REQUIRED",
  "SHARED_LINK_BUYER_NOT_VERIFIABLE",
]);

export function toOrderImportRow(order: ShopeeSyncOrder): OrderImportRow {
  return {
    platform: "SHOPEE",
    platform_order_id: order.orderSn,
    status: order.status,
    order_amount_vnd: String(order.orderAmountVnd),
    commission_vnd: String(order.commissionVnd),
    external_status: order.externalStatus,
    ...(order.subId ? { sub_id: order.subId } : {}),
    ...(order.cancelReason ? { cancel_reason: order.cancelReason } : {}),
    ...(order.purchasedAt ? { purchased_at: order.purchasedAt } : {}),
    ...(order.completedAt ? { completed_at: order.completedAt } : {}),
    ...(order.items.length
      ? {
          items: order.items.map((item) => ({
            item_id: item.itemId,
            item_name: item.itemName,
            quantity: item.quantity,
            amount_vnd: item.amountVnd,
            item_image_url: item.imageUrl,
          })),
        }
      : {}),
  };
}

/**
 * Đồng bộ báo cáo chuyển đổi Shopee về lịch sử đơn hàng của người dùng.
 *
 * Với mỗi đơn: đối chiếu Sub ID trong `utm_content` → link ShopTik → tài khoản,
 * ghi/cập nhật `orders` + `order_items`, rồi để `importOrderRow` xử lý tiền
 * (ghi ví CHỜ, hẹn ngày giải ngân với đơn Hoàn thành, đảo khoản với đơn hủy).
 * Cuối lượt chạy, giải ngân các đơn đã qua thời gian giữ tiền.
 */
export async function runShopeeOrderSync(
  db: Database,
  config: AppConfig,
  options: {
    actorId: string;
    fetcher?: Fetcher;
    /** Bỏ qua kiểm tra bật/tắt — dùng cho nút "Đồng bộ ngay" của admin. */
    force?: boolean;
  },
): Promise<ShopeeSyncSummary> {
  const settings = await getPlatformSyncSettings(db);
  if (!settings.shopeeEnabled && !options.force) {
    throw new AppError(
      "SHOPEE_SYNC_DISABLED",
      "Đồng bộ Shopee đang tắt trong cấu hình.",
    );
  }
  const cookie = await getShopeeCookie(db, config);
  if (!cookie) {
    throw new AppError(
      "SHOPEE_COOKIE_REQUIRED",
      "Chưa có cookie Shopee. Hãy nhập cookie trong trang Đồng bộ sàn.",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const summary: ShopeeSyncSummary = {
    fetched: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    releasedOrders: 0,
    releasedAmountVnd: 0,
    failures: [],
  };

  let outcome: SyncRunOutcome;
  try {
    const report = await fetchShopeeReport(
      cookie,
      {
        purchaseTimeStart:
          nowSeconds - settings.shopeeLookbackDays * 24 * 60 * 60,
        purchaseTimeEnd: nowSeconds,
      },
      options.fetcher ?? fetch,
    );
    const orders = parseShopeeReportOrders(report.list);
    summary.fetched = orders.length;

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
            `Đơn ${order.orderSn}: ${
              appError?.message ?? "Lỗi không xác định"
            }`,
          );
        }
      }
    }
    outcome = {
      status: summary.failed ? "PARTIAL" : "SUCCESS",
      fetched: summary.fetched,
      imported: summary.imported,
      failed: summary.failed,
      ...(summary.failures[0] ? { error: summary.failures[0] } : {}),
    };
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "Lỗi không xác định khi gọi báo cáo Shopee.";
    await recordShopeeSyncRun(db, {
      status: "ERROR",
      fetched: 0,
      imported: 0,
      failed: 0,
      error: message,
    });
    throw error;
  }

  await recordShopeeSyncRun(db, outcome);

  const release = await releaseDueCashback(db, { actorId: options.actorId });
  summary.releasedOrders = release.released;
  summary.releasedAmountVnd = release.amountVnd;
  return summary;
}

/** Đến giờ chạy lượt đồng bộ định kỳ tiếp theo chưa? */
export function isShopeeSyncDue(
  settings: {
    shopeeEnabled: boolean;
    shopeeHasCookie: boolean;
    shopeeIntervalMinutes: number;
    shopeeLastRunAt: Date | null;
  },
  now: Date = new Date(),
): boolean {
  if (!settings.shopeeEnabled || !settings.shopeeHasCookie) return false;
  if (!settings.shopeeLastRunAt) return true;
  const nextRunAt =
    settings.shopeeLastRunAt.getTime() +
    settings.shopeeIntervalMinutes * 60_000;
  return now.getTime() >= nextRunAt;
}
