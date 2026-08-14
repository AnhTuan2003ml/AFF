import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { parseInput } from "../../lib/validation.js";
import {
  claimNextHarvestJob,
  completeHarvestJob,
  getHarvestSettings,
  parseShopeeOfferPage,
  saveOfferPage,
  EXCLUSIVE_LIST_TYPE,
  SHOPEE_OFFER_API_PATH,
  SHOPEE_OFFER_FOR_ME_URL,
  SHOPEE_OFFER_PAGE_URL,
} from "../../services/discover-harvest.js";
import type { ApiDeps } from "./deps.js";

/**
 * API cho profile-worker (Playwright chạy trên máy host, xem thư mục
 * profile-worker/). Xác thực bằng header x-harvest-token so với
 * HARVEST_WORKER_TOKEN — không dùng session/CSRF.
 */

function requireWorkerToken(deps: ApiDeps, request: FastifyRequest): void {
  const expected = deps.config.HARVEST_WORKER_TOKEN;
  if (!expected) {
    throw new AppError(
      "HARVEST_DISABLED",
      "Chưa cấu hình HARVEST_WORKER_TOKEN nên API worker đang tắt.",
      503,
    );
  }
  const provided = String(request.headers["x-harvest-token"] ?? "");
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
  if (!matches) {
    throw new AppError("FORBIDDEN", "Token worker không hợp lệ.", 401);
  }
}

export async function registerHarvestApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  // Worker poll vài giây một lần: nhận job kế tiếp (nếu có) + cấu hình lượt lấy.
  app.post(
    "/harvest/poll",
    { config: { csrf: false } },
    async (request) => {
      requireWorkerToken(deps, request);
      const [job, settings] = [
        await claimNextHarvestJob(deps.db),
        await getHarvestSettings(deps.db),
      ];
      return {
        job: job
          ? {
              id: job.id,
              kind: job.kind,
              profileId: job.profile_id,
              profileName: job.profile_name,
              params: job.params ?? {},
            }
          : null,
        config: {
          pages: settings.pages,
          pageLimit: settings.pageLimit,
          offerPageUrl: SHOPEE_OFFER_PAGE_URL,
          offerApiPath: SHOPEE_OFFER_API_PATH,
          // URL trang theo list_type: 8 = "Ưu đãi cho tôi", còn lại product_offer.
          pageUrlByListType: {
            [EXCLUSIVE_LIST_TYPE]: SHOPEE_OFFER_FOR_ME_URL,
          },
        },
      };
    },
  );

  // Lưu NGAY một trang offer vào kho (worker gọi sau mỗi trang trong dải,
  // trước khi sang trang kế) — dữ liệu bền dần, job lỗi giữa chừng không mất
  // các trang đã lấy.
  app.post(
    "/harvest/offer-page",
    { config: { csrf: false }, bodyLimit: 4 * 1024 * 1024 },
    async (request) => {
      requireWorkerToken(deps, request);
      const input = parseInput(
        z.object({
          listType: z.coerce.number().int().min(0).max(20),
          pageNo: z.coerce.number().int().min(1).max(1000),
          payload: z.unknown(),
        }),
        request.body,
      );
      const products = parseShopeeOfferPage(input.payload);
      await saveOfferPage(deps.db, input.listType, input.pageNo, products);
      return { ok: true, saved: products.length };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/harvest/jobs/:id/complete",
    // Payload là các trang JSON thô từ Shopee — dải nhiều trang có thể lớn.
    { config: { csrf: false }, bodyLimit: 48 * 1024 * 1024 },
    async (request) => {
      requireWorkerToken(deps, request);
      const params = parseInput(
        z.object({ id: z.string().uuid("Job id không hợp lệ.") }),
        request.params,
      );
      const input = parseInput(
        z.object({
          ok: z.boolean(),
          error: z.string().max(2000).optional(),
          loginOk: z.boolean().optional(),
          payloads: z.array(z.unknown()).max(60).optional(),
          savedItems: z.coerce.number().int().min(0).optional(),
        }),
        request.body,
      );
      const result = await completeHarvestJob(deps.db, deps.config, params.id, {
        ok: input.ok,
        ...(input.error !== undefined ? { error: input.error } : {}),
        ...(input.loginOk !== undefined ? { loginOk: input.loginOk } : {}),
        ...(input.payloads !== undefined ? { payloads: input.payloads } : {}),
        ...(input.savedItems !== undefined ? { savedItems: input.savedItems } : {}),
      });
      return { ok: true, result };
    },
  );
}
