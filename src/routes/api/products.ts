import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import { query } from "../../db.js";
import { AppError } from "../../lib/errors.js";
import { parseInput } from "../../lib/validation.js";
import {
  createPurchaseIntent,
  PRODUCT_PLATFORMS,
} from "../../services/affiliate.js";
import { getBusinessConfig } from "../../services/business-config.js";
import { resolveBuyerPercent } from "../../services/commission.js";
import {
  calculateBuyerCashback,
  lookupProductPreview,
} from "../../services/product-preview.js";
import { storePreview, takePreview } from "../../services/preview-cache.js";
import type { ApiDeps } from "./deps.js";

/**
 * Luồng mua hoàn tiền, đúng hai bước người dùng thấy trên màn hình:
 *
 * 1. POST /products/preview  — dán link, tra cứu: trả tên, ảnh, giá gốc,
 *    tiền hoàn dự kiến kèm `previewId`. Không ghi gì vào DB.
 * 2. POST /products/purchase — bấm "Mua ngay": đổi `previewId` lấy link
 *    Affiliate (`buyUrl`), lúc này mới tạo bản ghi affiliate_links.
 */
export async function registerProductApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  // Tra cứu hoàn tiền MỞ cho khách (không cần đăng nhập) để dán link dùng ngay.
  // Chỉ bước "Mua" (purchase) mới bắt đăng nhập.
  app.post(
    "/products/preview",
    {
      // Xem trước là công khai (khách chưa đăng nhập vẫn dùng) và KHÔNG ghi DB —
      // chỉ cache tạm trong RAM — nên miễn CSRF để app/khách gọi thẳng được.
      config: { csrf: false, rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          productUrl: z.string().trim().min(10).max(2048),
          platform: z.enum(PRODUCT_PLATFORMS).optional(),
        }),
        request.body,
      );
      const businessConfig = await getBusinessConfig(deps.db, deps.config);
      let product = await lookupProductPreview(
        deps.config,
        input.productUrl,
        businessConfig.buyerCashbackPercent,
        fetch,
        input.platform,
      );
      // Đơn nhỏ (giá ≤ ngưỡng cấu hình, mặc định 25.000₫) hoàn tới 80%: chỉ
      // biết giá SAU khi tra cứu nên tính lại % và tiền hoàn tại đây.
      const buyerPercent = resolveBuyerPercent(product.priceVnd, businessConfig);
      if (buyerPercent !== product.buyerCashbackPercent) {
        product = {
          ...product,
          buyerCashbackPercent: buyerPercent,
          buyerCashbackVnd: calculateBuyerCashback(
            product.affiliateCommissionVnd,
            buyerPercent,
          ),
        };
      }
      const previewId = storePreview(request.currentUser?.id ?? "guest", product);
      return reply.send({ product, previewId });
    },
  );

  app.post(
    "/products/purchase",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const input = parseInput(
        z.object({ previewId: z.string().trim().min(10).max(64) }),
        request.body,
      );
      const cached = takePreview(request.currentUser!.id, input.previewId);
      if (!cached) {
        throw new AppError(
          "PREVIEW_EXPIRED",
          "Kết quả tra cứu đã hết hạn. Hãy tra cứu lại sản phẩm.",
          410,
        );
      }
      const purchase = await createPurchaseIntent(deps.db, deps.config, {
        userId: request.currentUser!.id,
        productUrl: cached.product.normalizedUrl,
        cashbackRateBps: cached.product.buyerCashbackPercent * 100,
        product: cached.product,
        source: "app",
        campaign: "instantbuy",
      });
      return reply.code(201).send({
        buyUrl: purchase.buyUrl,
        clickId: purchase.clickId,
        platform: purchase.platform,
      });
    },
  );

  // Bình luận cộng đồng dưới sản phẩm vừa tra cứu.
  app.get(
    "/products/comments",
    { preHandler: requireApiUser },
    async (request) => {
      const input = parseInput(
        z.object({
          platform: z.enum(PRODUCT_PLATFORMS),
          productId: z.string().trim().regex(/^\d{1,20}$/),
        }),
        request.query,
      );
      const comments = await query<{
        id: string;
        full_name: string;
        content: string;
        created_at: Date;
      }>(
        deps.db,
        `
          SELECT c.id, u.full_name, c.content, c.created_at
          FROM product_comments c
          JOIN users u ON u.id = c.user_id
          WHERE c.platform = $1 AND c.product_id = $2
          ORDER BY c.created_at DESC
          LIMIT 20
        `,
        [input.platform, input.productId],
      );
      return { data: comments.rows };
    },
  );

  app.post(
    "/products/comments",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          platform: z.enum(PRODUCT_PLATFORMS),
          productId: z.string().trim().regex(/^\d{1,20}$/),
          content: z
            .string()
            .trim()
            .min(2, "Bình luận quá ngắn.")
            .max(500, "Bình luận tối đa 500 ký tự."),
        }),
        request.body,
      );
      const inserted = await query<{ id: string; created_at: Date }>(
        deps.db,
        `
          INSERT INTO product_comments (user_id, platform, product_id, content)
          VALUES ($1, $2, $3, $4)
          RETURNING id, created_at
        `,
        [
          request.currentUser!.id,
          input.platform,
          input.productId,
          input.content,
        ],
      );
      return reply.code(201).send({
        id: inserted.rows[0]!.id,
        fullName: request.currentUser!.fullName,
        content: input.content,
        createdAt: inserted.rows[0]!.created_at,
      });
    },
  );
}
