import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { releaseDueCashback } from "../services/cashback-release.js";
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

      const release = await releaseDueCashback(db, { actorId });
      if (release.released > 0) {
        logger.info(
          { orders: release.released, amountVnd: release.amountVnd },
          "Đã giải ngân tiền hoàn đến hạn",
        );
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
