import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { releaseDueCashback } from "../services/cashback-release.js";
import { directFetchHotDeals } from "../services/browser-control.js";
import { refreshShopeeVouchers } from "../services/shopee-voucher.js";
import {
  enqueueDueHarvest,
  HOT_DEALS_LIST_TYPE,
} from "../services/discover-harvest.js";
import {
  getLazadaOffersLastFetchedAt,
  refreshLazadaOffers,
} from "../services/lazada-offer-store.js";
import { pruneUnconfirmedInstantBuys } from "../services/instantbuy-cleanup.js";
import { getPlatformSyncSettings } from "../services/platform-sync-settings.js";
import {
  isShopeeSyncDue,
  runShopeeOrderSync,
} from "../services/shopee-order-sync.js";

/**
 * Tiến trình nền một nhịp/phút: đến hạn thì gọi báo cáo Shopee để cập nhật
 * lịch sử đơn, và luôn giải ngân các đơn đã qua thời gian giữ tiền.
 *
 * Chỉ chạy một lượt tại một thời điểm (cờ `running`) để không tạo hai lượt
 * đồng bộ chồng nhau khi API sàn phản hồi chậm.
 */
export function startSyncScheduler(
  db: Database,
  config: AppConfig,
  logger: FastifyBaseLogger,
): { stop: () => void } {
  let running = false;

  async function systemActorId(): Promise<string | null> {
    const actor = await query<{ id: string }>(
      db,
      `
        SELECT id FROM users
        WHERE role IN ('SUPER_ADMIN', 'ADMIN') AND status = 'ACTIVE'
        ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 0 ELSE 1 END, created_at
        LIMIT 1
      `,
    );
    return actor.rows[0]?.id ?? null;
  }

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const actorId = await systemActorId();
      if (!actorId) return;

      const settings = await getPlatformSyncSettings(db);
      if (isShopeeSyncDue(settings)) {
        try {
          const summary = await runShopeeOrderSync(db, config, { actorId });
          logger.info(
            {
              fetched: summary.fetched,
              imported: summary.imported,
              skipped: summary.skipped,
              failed: summary.failed,
            },
            "Đã đồng bộ báo cáo Shopee",
          );
        } catch (error) {
          logger.warn({ err: error }, "Đồng bộ báo cáo Shopee thất bại");
        }
      }

      // Đến hạn lấy sản phẩm đề xuất: xếp lệnh FETCH cho profile-worker.
      try {
        if (await enqueueDueHarvest(db)) {
          logger.info("Đã xếp lệnh lấy sản phẩm đề xuất Shopee cho worker.");
        }
      } catch (error) {
        logger.warn({ err: error }, "Không xếp được lệnh lấy sản phẩm đề xuất");
      }

      // 1h sáng VN: cập nhật kho Khám phá theo HAI LUỒNG SONG SONG, lưu vào DB
      // trước để trang đọc nhanh:
      //   · Shopee — Deal Hot (điều khiển profile) + voucher hôm nay.
      //   · Lazada — sản phẩm affiliate (API /marketing/product/feed).
      // Mỗi luồng có mốc chống chạy lại trong 12h; lỗi luồng này không chặn luồng kia.
      try {
        const now = new Date();
        const vnHour = (now.getUTCHours() + 7) % 24;
        if (vnHour === 1) {
          const shopeeFlow = (async () => {
            const last = await query<{ t: Date | null }>(
              db,
              "SELECT max(fetched_at) AS t FROM shopee_offer_products WHERE list_type = $1",
              [HOT_DEALS_LIST_TYPE],
            );
            const lastT = last.rows[0]?.t ? new Date(last.rows[0].t) : null;
            const doneRecently =
              lastT && now.getTime() - lastT.getTime() < 12 * 3600 * 1000;
            if (doneRecently) return;
            const prof = await query<{ id: string }>(
              db,
              `SELECT id FROM harvest_profiles WHERE status <> 'DISABLED'
               ORDER BY last_fetch_at ASC NULLS FIRST LIMIT 1`,
            );
            if (prof.rows[0]) {
              const r = await directFetchHotDeals(db, config, {
                profileId: prof.rows[0].id,
                maxItems: 200,
              });
              logger.info({ items: r.savedItems }, "Đã lấy Deal Hot (1h sáng)");
            }
            try {
              const rv = await refreshShopeeVouchers(db);
              logger.info({ count: rv.count }, "Đã làm mới voucher (1h sáng)");
            } catch (e) {
              logger.warn({ err: e }, "Làm mới voucher thất bại");
            }
          })().catch((e) =>
            logger.warn({ err: e }, "Luồng Shopee Deal Hot thất bại"),
          );

          const lazadaFlow = (async () => {
            const lastLz = await getLazadaOffersLastFetchedAt(db);
            const doneLz =
              lastLz && now.getTime() - lastLz.getTime() < 12 * 3600 * 1000;
            if (doneLz) return;
            const r = await refreshLazadaOffers(db, config);
            logger.info(
              { items: r.saved },
              "Đã làm mới sản phẩm Lazada (1h sáng)",
            );
          })().catch((e) =>
            logger.warn({ err: e }, "Luồng làm mới Lazada thất bại"),
          );

          await Promise.all([shopeeFlow, lazadaFlow]);
        }
      } catch (error) {
        logger.warn({ err: error }, "Cập nhật kho Khám phá (Shopee/Lazada) thất bại");
      }

      const release = await releaseDueCashback(db, { actorId });
      if (release.released > 0) {
        logger.info(
          { orders: release.released, amountVnd: release.amountVnd },
          "Đã giải ngân tiền hoàn đến hạn",
        );
      }

      // Dọn lượt "Mua ngay" quá hạn mà đối soát vẫn chưa gán được đơn thật.
      try {
        const pruned = await pruneUnconfirmedInstantBuys(db, config);
        if (pruned > 0) {
          logger.info(
            { removed: pruned },
            "Đã xóa lượt mua chưa thành đơn khỏi lịch sử",
          );
        }
      } catch (error) {
        logger.warn({ err: error }, "Không dọn được lượt mua chưa thành đơn");
      }
    } catch (error) {
      logger.error({ err: error }, "Lỗi tiến trình đồng bộ nền");
    } finally {
      running = false;
    }
  }

  const timer = setInterval(
    () => void tick(),
    config.SYNC_SCHEDULER_TICK_SECONDS * 1000,
  );
  timer.unref?.();
  void tick();

  return {
    stop: () => clearInterval(timer),
  };
}
