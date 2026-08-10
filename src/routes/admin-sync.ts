import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { parseInput } from "../lib/validation.js";
import { writeAuditLog } from "../services/audit.js";
import { getBusinessConfig } from "../services/business-config.js";
import {
  getPlatformSyncSettings,
  updatePlatformSyncSettings,
} from "../services/platform-sync-settings.js";
import { runShopeeOrderSync } from "../services/shopee-order-sync.js";
import {
  flashAdminError,
  type AdminConsoleDeps,
} from "./admin-console-shared.js";

const MANAGE_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE"];

export async function registerAdminSyncRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/sync", async (_request, reply) => {
    const [syncSettings, businessConfig] = await Promise.all([
      getPlatformSyncSettings(deps.db),
      getBusinessConfig(deps.db, deps.config),
    ]);
    return reply.view("backoffice/sync.njk", {
      pageTitle: "Đồng bộ sàn",
      backofficeSection: "sync",
      syncSettings,
      cashbackHoldDays: businessConfig.cashbackHoldDays,
    });
  });

  app.post("/sync", async (request, reply) => {
    if (!MANAGE_ROLES.includes(request.currentUser!.role)) {
      throw new AppError(
        "FORBIDDEN",
        "Bạn không có quyền đổi cấu hình đồng bộ.",
        403,
      );
    }
    try {
      const body = request.body as Record<string, unknown>;
      const input = parseInput(
        z.object({
          shopeeIntervalMinutes: z.coerce
            .number("Tần suất đồng bộ phải là số.")
            .int()
            .min(5, "Tần suất đồng bộ phải từ 5 đến 1440 phút.")
            .max(1440, "Tần suất đồng bộ phải từ 5 đến 1440 phút."),
          shopeeLookbackDays: z.coerce
            .number("Số ngày truy hồi phải là số.")
            .int()
            .min(1, "Số ngày truy hồi phải từ 1 đến 180.")
            .max(180, "Số ngày truy hồi phải từ 1 đến 180."),
          shopeeCookie: z.string().max(16_384, "Cookie quá dài.").optional(),
          shopeeEnabled: z.coerce.boolean(),
          clearShopeeCookie: z.coerce.boolean(),
        }),
        {
          ...body,
          shopeeEnabled: body.shopeeEnabled === "on",
          clearShopeeCookie: body.clearShopeeCookie === "on",
        },
      );

      const before = await getPlatformSyncSettings(deps.db);
      const after = await updatePlatformSyncSettings(
        deps.db,
        deps.config,
        {
          shopeeEnabled: input.shopeeEnabled,
          shopeeIntervalMinutes: input.shopeeIntervalMinutes,
          shopeeLookbackDays: input.shopeeLookbackDays,
          ...(input.shopeeCookie ? { shopeeCookie: input.shopeeCookie } : {}),
          clearShopeeCookie: input.clearShopeeCookie,
        },
        request.currentUser!.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "PLATFORM_SYNC_CONFIG_UPDATED",
        targetType: "BUSINESS_CONFIG",
        // Không ghi cookie vào nhật ký — chỉ ghi các tham số vận hành.
        before: {
          shopeeEnabled: before.shopeeEnabled,
          shopeeIntervalMinutes: before.shopeeIntervalMinutes,
          shopeeLookbackDays: before.shopeeLookbackDays,
          shopeeHasCookie: before.shopeeHasCookie,
        },
        after: {
          shopeeEnabled: after.shopeeEnabled,
          shopeeIntervalMinutes: after.shopeeIntervalMinutes,
          shopeeLookbackDays: after.shopeeLookbackDays,
          shopeeHasCookie: after.shopeeHasCookie,
        },
      });
      setFlash(
        reply,
        deps.config,
        "success",
        "Đã lưu cấu hình đồng bộ Shopee.",
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/sync");
  });

  app.post("/sync/run", async (request, reply) => {
    if (!MANAGE_ROLES.includes(request.currentUser!.role)) {
      throw new AppError("FORBIDDEN", "Bạn không có quyền chạy đồng bộ.", 403);
    }
    try {
      const summary = await runShopeeOrderSync(deps.db, deps.config, {
        actorId: request.currentUser!.id,
        force: true,
      });
      await writeAuditLog(deps.db, deps.config, request, {
        action: "PLATFORM_SYNC_RUN",
        targetType: "ORDER_BATCH",
        reason: `Đồng bộ thủ công: ${summary.imported}/${summary.fetched} đơn`,
        after: {
          fetched: summary.fetched,
          imported: summary.imported,
          skipped: summary.skipped,
          failed: summary.failed,
          releasedOrders: summary.releasedOrders,
        },
      });
      setFlash(
        reply,
        deps.config,
        summary.failed ? "info" : "success",
        `Đã lấy ${summary.fetched} đơn từ Shopee: ghi nhận ${summary.imported}, bỏ qua ${summary.skipped}, lỗi ${summary.failed}. Giải ngân ${summary.releasedOrders} đơn đến hạn.` +
          (summary.failures[0] ? ` ${summary.failures[0]}` : ""),
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/sync");
  });
}
