import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { parseInput } from "../lib/validation.js";
import { writeAuditLog } from "../services/audit.js";
import { getBusinessConfig } from "../services/business-config.js";
import { readProfileCookieHeader } from "../services/browser-control.js";
import { listHarvestProfiles } from "../services/discover-harvest.js";
import {
  buildLazadaAuthorizationUrl,
  createLazadaOAuthState,
  getLazadaTokenStatus,
  isLazadaOAuthConfigured,
} from "../services/lazada-oauth.js";
import {
  clearPlatformCookie,
  getPlatformSyncSettings,
  setPlatformCookie,
  updateShopeeSyncSchedule,
  type SyncPlatform,
} from "../services/platform-sync-settings.js";
import { runShopeeOrderSync } from "../services/shopee-order-sync.js";
import {
  flashAdminError,
  type AdminConsoleDeps,
} from "./admin-console-shared.js";

const MANAGE_ROLES = ["SUPER_ADMIN", "ADMIN", "FINANCE"];

const platformField = z.enum(["SHOPEE", "LAZADA"]);
const platformLabel: Record<SyncPlatform, string> = {
  SHOPEE: "Shopee",
  LAZADA: "Lazada",
};

export async function registerAdminSyncRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  const requireManage = (role: string): void => {
    if (!MANAGE_ROLES.includes(role)) {
      throw new AppError("FORBIDDEN", "Bạn không có quyền đổi cấu hình đồng bộ.", 403);
    }
  };

  const firstProfileId = async (): Promise<string> => {
    const profiles = await listHarvestProfiles(deps.db);
    const id = profiles[0]?.id;
    if (!id) {
      throw new AppError(
        "NO_PROFILE",
        "Chưa có Profile trong mục 'Trình duyệt lấy dữ liệu'. Thêm Profile ID trước khi lấy cookie tự động.",
      );
    }
    return id;
  };

  app.get("/sync", async (_request, reply) => {
    const [syncSettings, businessConfig, lazadaOauth, profiles] =
      await Promise.all([
        getPlatformSyncSettings(deps.db),
        getBusinessConfig(deps.db, deps.config),
        getLazadaTokenStatus(deps.db, deps.config),
        listHarvestProfiles(deps.db),
      ]);
    return reply.view("backoffice/sync.njk", {
      pageTitle: "Kết nối & đồng bộ sàn",
      backofficeSection: "sync",
      syncSettings,
      lazadaOauth,
      hasProfile: profiles.length > 0,
      cashbackHoldDays: businessConfig.cashbackHoldDays,
    });
  });

  // Bắt đầu OAuth Lazada Open API (dùng cho báo cáo đơn) — riêng với cookie
  // adsense dùng để sinh link.
  app.get("/lazada/start", async (request, reply) => {
    requireManage(request.currentUser!.role);
    if (!isLazadaOAuthConfigured(deps.config)) {
      setFlash(
        reply,
        deps.config,
        "error",
        "Chưa cấu hình LAZADA_OPEN_API_APP_KEY / APP_SECRET.",
      );
      return reply.redirect("/backoffice/sync");
    }
    const state = createLazadaOAuthState(deps.config);
    return reply.redirect(buildLazadaAuthorizationUrl(deps.config, state));
  });

  app.get("/lazada/status", async (_request, reply) => {
    reply.header("cache-control", "private, no-store");
    return getLazadaTokenStatus(deps.db, deps.config);
  });

  // Lưu lịch đồng bộ Shopee (bật/tắt + tần suất + phạm vi truy hồi).
  app.post("/sync", async (request, reply) => {
    requireManage(request.currentUser!.role);
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
          shopeeEnabled: z.coerce.boolean(),
        }),
        { ...body, shopeeEnabled: body.shopeeEnabled === "on" },
      );

      const before = await getPlatformSyncSettings(deps.db);
      const after = await updateShopeeSyncSchedule(
        deps.db,
        {
          shopeeEnabled: input.shopeeEnabled,
          shopeeIntervalMinutes: input.shopeeIntervalMinutes,
          shopeeLookbackDays: input.shopeeLookbackDays,
        },
        request.currentUser!.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "PLATFORM_SYNC_CONFIG_UPDATED",
        targetType: "BUSINESS_CONFIG",
        before: {
          shopeeEnabled: before.shopeeEnabled,
          shopeeIntervalMinutes: before.shopeeIntervalMinutes,
          shopeeLookbackDays: before.shopeeLookbackDays,
        },
        after: {
          shopeeEnabled: after.shopeeEnabled,
          shopeeIntervalMinutes: after.shopeeIntervalMinutes,
          shopeeLookbackDays: after.shopeeLookbackDays,
        },
      });
      setFlash(reply, deps.config, "success", "Đã lưu lịch đồng bộ Shopee.");
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/sync");
  });

  // Dán cookie tay cho một sàn.
  app.post("/sync/cookie/manual", async (request, reply) => {
    requireManage(request.currentUser!.role);
    try {
      const input = parseInput(
        z.object({
          platform: platformField,
          cookie: z.string().trim().min(1, "Hãy dán cookie.").max(16_384, "Cookie quá dài."),
        }),
        request.body,
      );
      await setPlatformCookie(
        deps.db,
        deps.config,
        { platform: input.platform, cookie: input.cookie, source: "MANUAL" },
        request.currentUser!.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "PLATFORM_COOKIE_SET",
        targetType: "BUSINESS_CONFIG",
        after: { platform: input.platform, source: "MANUAL" },
      });
      setFlash(
        reply,
        deps.config,
        "success",
        `Đã lưu cookie ${platformLabel[input.platform]} (dán tay).`,
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/sync");
  });

  // Tự động lấy cookie một sàn từ profile Browser Control (phiên đăng nhập sẵn).
  app.post("/sync/cookie/profile", async (request, reply) => {
    requireManage(request.currentUser!.role);
    try {
      const input = parseInput(
        z.object({ platform: platformField }),
        request.body,
      );
      const profileId = await firstProfileId();
      const cookie = await readProfileCookieHeader(
        deps.config,
        profileId,
        input.platform,
      );
      await setPlatformCookie(
        deps.db,
        deps.config,
        { platform: input.platform, cookie, source: "PROFILE" },
        request.currentUser!.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "PLATFORM_COOKIE_SET",
        targetType: "BUSINESS_CONFIG",
        after: { platform: input.platform, source: "PROFILE" },
      });
      setFlash(
        reply,
        deps.config,
        "success",
        `Đã lấy cookie ${platformLabel[input.platform]} từ profile.`,
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/sync");
  });

  // Xóa cookie đang lưu của một sàn.
  app.post("/sync/cookie/clear", async (request, reply) => {
    requireManage(request.currentUser!.role);
    try {
      const input = parseInput(
        z.object({ platform: platformField }),
        request.body,
      );
      await clearPlatformCookie(deps.db, input.platform, request.currentUser!.id);
      await writeAuditLog(deps.db, deps.config, request, {
        action: "PLATFORM_COOKIE_CLEARED",
        targetType: "BUSINESS_CONFIG",
        after: { platform: input.platform },
      });
      setFlash(
        reply,
        deps.config,
        "success",
        `Đã xóa cookie ${platformLabel[input.platform]}.`,
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/sync");
  });

  app.post("/sync/run", async (request, reply) => {
    requireManage(request.currentUser!.role);
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
