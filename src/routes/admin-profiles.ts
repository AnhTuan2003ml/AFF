import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { parseInput } from "../lib/validation.js";
import { writeAuditLog } from "../services/audit.js";
import {
  BEST_SELLER_LIST_TYPE,
  EXCLUSIVE_LIST_TYPE,
  RECOMMEND_LIST_TYPE,
  deleteHarvestProfile,
  getCachedPageRange,
  getHarvestSettings,
  isWorkerOnline,
  listHarvestProfiles,
  listRecentHarvestJobs,
  setSingleHarvestProfile,
  updateHarvestSettings,
} from "../services/discover-harvest.js";
import { query } from "../db.js";
import { directFetchOfferRange } from "../services/browser-control.js";
import {
  flashAdminError,
  type AdminConsoleDeps,
} from "./admin-console-shared.js";

/**
 * Quản lý profile Shopee Affiliate: mỗi profile là một trình duyệt bền vững
 * do profile-worker (máy host) giữ. Admin bấm "Mở đăng nhập" để worker mở
 * cửa sổ đăng nhập; bấm "Lấy sản phẩm" để worker mở trang offer/product_offer
 * và bắt response api/v3/offer/product/list đổ vào trang Khám phá.
 */

const MANAGE_ROLES = ["SUPER_ADMIN", "ADMIN"];

function requireManage(role: string): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new AppError("FORBIDDEN", "Bạn không có quyền quản lý profile.", 403);
  }
}

const idParams = z.object({ id: z.string().uuid("Profile không hợp lệ.") });

export async function registerAdminProfileRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/profiles", async (_request, reply) => {
    const [
      settings,
      profiles,
      jobs,
      autoCount,
      recommendRange,
      bestRange,
      exclusiveRange,
    ] = await Promise.all([
        getHarvestSettings(deps.db),
        listHarvestProfiles(deps.db),
        listRecentHarvestJobs(deps.db, 15),
        query<{ count: string }>(
          deps.db,
          `SELECT count(*)::text AS count FROM content_items
           WHERE source = 'SHOPEE_AUTO' AND status = 'PUBLISHED'`,
        ),
        getCachedPageRange(deps.db, RECOMMEND_LIST_TYPE),
        getCachedPageRange(deps.db, BEST_SELLER_LIST_TYPE),
        getCachedPageRange(deps.db, EXCLUSIVE_LIST_TYPE),
      ]);
    return reply.view("backoffice/profiles.njk", {
      pageTitle: "Profile Shopee",
      backofficeSection: "profiles",
      settings,
      profiles,
      currentProfile: profiles[0] ?? null,
      jobs,
      workerOnline: isWorkerOnline(settings),
      workerConfigured: Boolean(deps.config.HARVEST_WORKER_TOKEN),
      autoPublishedCount: Number(autoCount.rows[0]?.count ?? 0),
      recommendRange,
      bestRange,
      exclusiveRange,
    });
  });

  // Lấy dải trang cho một danh mục (Đề xuất / Bán chạy): "từ trang A đến B".
  app.post("/profiles/fetch-range", async (request, reply) => {
    requireManage(request.currentUser!.role);
    try {
      const input = parseInput(
        z.object({
          list: z.enum(["recommend", "best", "exclusive"]),
          fromPage: z.coerce
            .number("Trang đầu phải là số.")
            .int()
            .min(1, "Trang đầu tối thiểu 1."),
          toPage: z.coerce
            .number("Trang cuối phải là số.")
            .int()
            .min(1, "Trang cuối tối thiểu 1."),
        }),
        request.body,
      );
      const listTypeByList: Record<string, number> = {
        recommend: RECOMMEND_LIST_TYPE,
        best: BEST_SELLER_LIST_TYPE,
        exclusive: EXCLUSIVE_LIST_TYPE,
      };
      const labelByList: Record<string, string> = {
        recommend: "Đề xuất",
        best: "Bán chạy nhất",
        exclusive: "Ưu đãi độc quyền",
      };
      if (input.toPage - input.fromPage + 1 > 40) {
        throw new AppError(
          "RANGE_TOO_LARGE",
          "Mỗi lượt tối đa 40 trang. Hãy chia nhỏ dải trang.",
        );
      }
      const profile = (await listHarvestProfiles(deps.db))[0];
      if (!profile) {
        throw new AppError(
          "NO_PROFILE",
          "Chưa có Profile ID. Điền Profile ID của Browser Control ở trên.",
        );
      }
      // Server ĐIỀU KHIỂN TRỰC TIẾP profile qua CDP — không qua worker.
      const result = await directFetchOfferRange(deps.db, deps.config, {
        profileId: profile.id,
        listType: listTypeByList[input.list]!,
        fromPage: input.fromPage,
        toPage: input.toPage,
      });
      const label = labelByList[input.list]!;
      setFlash(
        reply,
        deps.config,
        "success",
        `Đã lấy ${label}: ${result.savedItems} sản phẩm / ${result.savedPages} trang.` +
          (result.note ? ` ${result.note}` : ""),
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/profiles");
  });

  // Một ô Profile ID duy nhất: đặt/đổi profile Browser Control để lấy dữ liệu.
  // Không có bước đăng nhập/mở/tắt — phiên nằm sẵn trong Browser Control.
  app.post("/profiles", async (request, reply) => {
    requireManage(request.currentUser!.role);
    try {
      const input = parseInput(
        z.object({
          name: z.string().trim().max(80).optional(),
          profileId: z
            .string()
            .trim()
            .uuid("Profile ID phải là UUID lấy từ Browser Control."),
        }),
        request.body,
      );
      const profile = await setSingleHarvestProfile(
        deps.db,
        { id: input.profileId, name: input.name },
        request.currentUser!.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "HARVEST_PROFILE_SET",
        targetType: "HARVEST_PROFILE",
        targetId: profile.id,
        after: { name: profile.name },
      });
      setFlash(
        reply,
        deps.config,
        "success",
        "Đã lưu Profile ID. Bấm nút lấy sản phẩm bên dưới là worker điều khiển thẳng profile này.",
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/profiles");
  });

  // Gỡ profile khỏi ShopTik (Browser Control vẫn giữ nguyên).
  app.post<{ Params: { id: string } }>(
    "/profiles/:id/delete",
    async (request, reply) => {
      requireManage(request.currentUser!.role);
      try {
        const params = parseInput(idParams, request.params);
        const removed = await deleteHarvestProfile(deps.db, params.id);
        if (!removed) {
          throw new AppError("PROFILE_NOT_FOUND", "Không tìm thấy profile.", 404);
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: "HARVEST_PROFILE_DELETED",
          targetType: "HARVEST_PROFILE",
          targetId: params.id,
        });
        setFlash(reply, deps.config, "success", "Đã gỡ profile khỏi ShopTik.");
      } catch (error) {
        flashAdminError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/profiles");
    },
  );

  app.post("/profiles/settings", async (request, reply) => {
    requireManage(request.currentUser!.role);
    try {
      const body = request.body as Record<string, unknown>;
      const input = parseInput(
        z.object({
          intervalMinutes: z.coerce
            .number("Tần suất phải là số.")
            .int()
            .min(15, "Tần suất tối thiểu 15 phút.")
            .max(10080, "Tần suất tối đa 7 ngày."),
          pages: z.coerce
            .number("Số trang phải là số.")
            .int()
            .min(1, "Ít nhất 1 trang.")
            .max(10, "Tối đa 10 trang."),
          maxItems: z.coerce
            .number("Số sản phẩm phải là số.")
            .int()
            .min(10, "Ít nhất 10 sản phẩm.")
            .max(200, "Tối đa 200 sản phẩm."),
          enabled: z.coerce.boolean(),
        }),
        { ...body, enabled: body.enabled === "on" },
      );
      const after = await updateHarvestSettings(
        deps.db,
        {
          enabled: input.enabled,
          intervalMinutes: input.intervalMinutes,
          pages: input.pages,
          maxItems: input.maxItems,
        },
        request.currentUser!.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "HARVEST_CONFIG_UPDATED",
        targetType: "BUSINESS_CONFIG",
        after: {
          enabled: after.enabled,
          intervalMinutes: after.intervalMinutes,
          pages: after.pages,
          maxItems: after.maxItems,
        },
      });
      setFlash(reply, deps.config, "success", "Đã lưu cấu hình lấy sản phẩm.");
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/profiles");
  });
}
