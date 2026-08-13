import type { FastifyInstance } from "fastify";
import path from "node:path";
import { z } from "zod";
import { requireRoles } from "../auth/guards.js";
import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { parseInput } from "../lib/validation.js";
import { writeAuditLog } from "../services/audit.js";
import { releaseWithdrawalHold } from "../services/ledger.js";
import {
  normalizeContentImageUrl,
  normalizeContentTargetUrl,
  removeContentImage,
  saveContentImage,
} from "../services/content-image.js";
import {
  getBusinessConfig,
  updateBusinessConfig,
} from "../services/business-config.js";
import {
  buildBarList,
  buildCommissionStackedBar,
  buildTrendChart,
} from "../services/chart-data.js";
import {
  AUDIT_TARGET_TYPES,
  auditActionTone,
  formatVnd,
} from "../lib/format.js";
import { selectedValue } from "./admin-console-shared.js";
import {
  approveMissionClaim,
  createMissionDefinition,
  deleteMissionDefinition,
  listMissionClaims,
  listMissionDefinitions,
  rejectMissionClaim,
  updateMissionDefinition,
} from "../services/mission.js";
import {
  AI_PROVIDERS,
  addKbDocument,
  deleteKbDocument,
  getAutoReplySettings,
  listKbDocuments,
  saveAutoReplySettings,
} from "../services/support-autoreply.js";

interface BackofficeDeps {
  db: Database;
  config: AppConfig;
}

function flashError(
  reply: Parameters<typeof setFlash>[0],
  config: AppConfig,
  error: unknown,
): void {
  setFlash(
    reply,
    config,
    "error",
    error instanceof AppError
      ? error.message
      : "Không thể hoàn tất thao tác.",
  );
}

const idsFromBody = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
};

const CONTENT_ITEM_SCHEMA = z.object({
  type: z.enum(["VOUCHER", "TRENDING", "GUIDE", "ANNOUNCEMENT", "PRODUCT"]),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  targetUrl: z.string().trim().max(2048).optional().default(""),
  imageUrl: z.string().trim().max(2048).optional().default(""),
  badge: z.string().trim().max(40).optional().default(""),
  category: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional().default(0),
  // Rỗng ("") nghĩa là "không nhập" — chỉ áp dụng cho các trường riêng của
  // loại "Sản phẩm nổi bật" (platform/giá/hoa hồng), không bắt buộc với
  // Voucher/Xu hướng/Hướng dẫn/Thông báo.
  platform: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.enum(["SHOPEE", "TIKTOK", "LAZADA"]).optional(),
  ),
  priceVnd: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(0).optional(),
  ),
  originalPriceVnd: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().min(0).optional(),
  ),
  // Admin nhập % (dễ hiểu hơn bps) — quy đổi sang bps khi lưu.
  cashbackRatePercent: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().min(0).max(100).optional(),
  ),
});

function parseContentItemInput(rawBody: Record<string, unknown>): {
  input: z.infer<typeof CONTENT_ITEM_SCHEMA>;
  cashbackRateBps: number | undefined;
} {
  const textValue = (value: unknown): string =>
    typeof value === "string" ? value : value == null ? "" : String(value);
  const input = parseInput(CONTENT_ITEM_SCHEMA, {
    type: textValue(rawBody.type),
    title: textValue(rawBody.title),
    description: textValue(rawBody.description),
    targetUrl: textValue(rawBody.targetUrl),
    imageUrl: textValue(rawBody.imageUrl),
    badge: textValue(rawBody.badge),
    category: textValue(rawBody.category),
    sortOrder: textValue(rawBody.sortOrder),
    platform: textValue(rawBody.platform),
    priceVnd: textValue(rawBody.priceVnd),
    originalPriceVnd: textValue(rawBody.originalPriceVnd),
    cashbackRatePercent: textValue(rawBody.cashbackRatePercent),
  });
  const cashbackRateBps =
    input.cashbackRatePercent !== undefined
      ? Math.round(input.cashbackRatePercent * 100)
      : undefined;
  if (input.type === "PRODUCT" && !input.platform) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Sản phẩm nổi bật cần chọn sàn (Shopee/TikTok Shop/Lazada).",
    );
  }
  return { input, cashbackRateBps };
}

const MISSION_DEFINITION_SCHEMA = z.object({
  type: z.enum(["REFERRAL_MILESTONE", "PURCHASE_MILESTONE"]),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().default(""),
  threshold: z.coerce.number().int().min(1).max(100000),
  rewardAmountVnd: z.coerce.number().int().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional().default(0),
});

export async function registerBackofficeRoutes(
  app: FastifyInstance,
  deps: BackofficeDeps,
): Promise<void> {
  app.addHook(
    "preHandler",
    requireRoles("SUPER_ADMIN", "ADMIN", "FINANCE", "RISK", "SUPPORT", "AUDITOR"),
  );

  // Trang tổng quan và đối soát đơn hợp nhất về AdminLayout mới — hai route
  // này từng có template/nghiệp vụ trùng lặp, nay chỉ giữ route chính.
  app.get("/", async (_request, reply) => reply.redirect("/backoffice/console"));
  app.get("/orders", async (_request, reply) =>
    reply.redirect("/backoffice/reconciliation"),
  );

  app.get("/banks", async (_request, reply) => {
    const accounts = await query<{
      id: string;
      email: string;
      full_name: string;
      bank_code: string;
      account_last4: string;
      account_name_masked: string;
      status: string;
      created_at: Date;
    }>(
      deps.db,
      `
        SELECT b.id, u.email, u.full_name, b.bank_code, b.account_last4,
          b.account_name_masked, b.status, b.created_at
        FROM user_bank_accounts b
        JOIN users u ON u.id = b.user_id
        ORDER BY
          CASE b.status WHEN 'PENDING_REVIEW' THEN 0 ELSE 1 END,
          b.created_at DESC
        LIMIT 200
      `,
    );
    return reply.view("backoffice/banks.njk", {
      pageTitle: "Xác minh ngân hàng",
      backofficeSection: "banks",
      accounts: accounts.rows,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/banks/:id/decision",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền xác minh.", 403);
      }
      try {
        const input = parseInput(
          z.object({
            decision: z.enum(["VERIFIED", "REJECTED"]),
            reason: z.string().trim().max(300).optional().default(""),
          }),
          request.body,
        );
        if (input.decision === "REJECTED" && input.reason.length < 5) {
          throw new AppError(
            "REASON_REQUIRED",
            "Cần nhập lý do từ chối rõ ràng.",
          );
        }
        const updated = await query(
          deps.db,
          `
            UPDATE user_bank_accounts
            SET status = $2, rejection_reason = NULLIF($3, ''),
              verified_by = CASE WHEN $2 = 'VERIFIED' THEN $4 ELSE NULL END,
              verified_at = CASE WHEN $2 = 'VERIFIED' THEN now() ELSE NULL END
            WHERE id = $1 AND status = 'PENDING_REVIEW'
          `,
          [
            request.params.id,
            input.decision,
            input.reason,
            request.currentUser!.id,
          ],
        );
        if (!updated.rowCount) {
          throw new AppError(
            "BANK_ALREADY_DECIDED",
            "Tài khoản ngân hàng đã được xử lý trước đó.",
          );
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: `BANK_${input.decision}`,
          targetType: "BANK_ACCOUNT",
          targetId: request.params.id,
          reason: input.reason,
        });
        setFlash(reply, deps.config, "success", "Đã lưu kết quả xác minh.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/banks");
    },
  );

  app.get("/withdrawals", async (_request, reply) => {
    const withdrawals = await query<{
      id: string;
      email: string;
      full_name: string;
      amount_vnd: string;
      bank_code: string;
      bank_last4: string;
      status: string;
      risk_score: number;
      requested_at: Date;
    }>(
      deps.db,
      `
        SELECT w.id, u.email, u.full_name, w.amount_vnd::text,
          w.bank_code, w.bank_last4, w.status, w.risk_score, w.requested_at
        FROM withdrawals w
        JOIN users u ON u.id = w.user_id
        ORDER BY
          CASE WHEN w.status IN ('FUNDS_HELD', 'UNKNOWN') THEN 0 ELSE 1 END,
          w.requested_at DESC
        LIMIT 200
      `,
    );
    return reply.view("backoffice/withdrawals.njk", {
      pageTitle: "Duyệt rút tiền",
      backofficeSection: "withdrawals",
      withdrawals: withdrawals.rows,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/withdrawals/:id/decision",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN", "FINANCE", "RISK"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền duyệt rút tiền.", 403);
      }
      try {
        const input = parseInput(
          z.object({
            decision: z.enum(["APPROVED", "REJECTED"]),
            reason: z.string().trim().max(500).optional().default(""),
          }),
          request.body,
        );
        if (
          input.decision === "APPROVED" &&
          !["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)
        ) {
          throw new AppError(
            "FORBIDDEN",
            "Vai trò rủi ro chỉ được từ chối/khóa, không được tự duyệt chi.",
            403,
          );
        }
        if (input.decision === "REJECTED") {
          if (input.reason.length < 5) {
            throw new AppError(
              "REASON_REQUIRED",
              "Cần nhập lý do từ chối rõ ràng.",
            );
          }
          await releaseWithdrawalHold(deps.db, {
            withdrawalId: request.params.id,
            actorId: request.currentUser!.id,
            reason: input.reason,
          });
        } else {
          const result = await query(
            deps.db,
            `
              UPDATE withdrawals
              SET status = 'APPROVED', decided_by = $2, decided_at = now()
              WHERE id = $1 AND status = 'FUNDS_HELD'
            `,
            [request.params.id, request.currentUser!.id],
          );
          if (!result.rowCount) {
            throw new AppError(
              "WITHDRAWAL_ALREADY_DECIDED",
              "Yêu cầu rút tiền đã được xử lý trước đó.",
            );
          }
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: `WITHDRAWAL_${input.decision}`,
          targetType: "WITHDRAWAL",
          targetId: request.params.id,
          reason: input.reason,
        });
        setFlash(
          reply,
          deps.config,
          "success",
          input.decision === "APPROVED"
            ? "Đã duyệt. Yêu cầu sẵn sàng chuyển sang đối tác chi hộ."
            : "Đã từ chối và hoàn lại số dư khả dụng.",
        );
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/withdrawals");
    },
  );

  app.post("/withdrawals/bulk-decision", async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN", "FINANCE", "RISK"].includes(request.currentUser!.role)) {
      throw new AppError("FORBIDDEN", "Bạn không có quyền xử lý rút tiền.", 403);
    }
    try {
      const body = request.body as Record<string, unknown>;
      const input = parseInput(
        z.object({
          decision: z.enum(["APPROVED", "REJECTED"]),
          scope: z.enum(["selected", "all_pending"]).optional().default("selected"),
          reason: z.string().trim().max(500).optional().default(""),
        }),
        body,
      );
      if (
        input.decision === "APPROVED" &&
        !["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)
      ) {
        throw new AppError(
          "FORBIDDEN",
          "Vai trò rủi ro không được duyệt chi.",
          403,
        );
      }
      if (input.decision === "REJECTED" && input.reason.length < 5) {
        throw new AppError(
          "REASON_REQUIRED",
          "Cần nhập lý do từ chối rõ ràng.",
        );
      }

      let ids = input.scope === "all_pending" ? [] : idsFromBody(body.ids);
      if (input.scope === "all_pending") {
        const pending = await query<{ id: string }>(
          deps.db,
          `
            SELECT id FROM withdrawals
            WHERE status = 'FUNDS_HELD'
            ORDER BY requested_at ASC
            LIMIT 500
          `,
        );
        ids = pending.rows.map((row) => row.id);
      }
      if (!ids.length) {
        throw new AppError(
          "NO_WITHDRAWAL_SELECTED",
          "Hãy chọn ít nhất một yêu cầu rút tiền.",
        );
      }

      let success = 0;
      const failures: string[] = [];
      for (const id of ids) {
        try {
          if (input.decision === "REJECTED") {
            await releaseWithdrawalHold(deps.db, {
              withdrawalId: id,
              actorId: request.currentUser!.id,
              reason: input.reason,
            });
          } else {
            const result = await query(
              deps.db,
              `
                UPDATE withdrawals
                SET status = 'APPROVED', decided_by = $2, decided_at = now()
                WHERE id = $1 AND status = 'FUNDS_HELD'
              `,
              [id, request.currentUser!.id],
            );
            if (!result.rowCount) {
              throw new AppError(
                "WITHDRAWAL_ALREADY_DECIDED",
                "Yêu cầu rút tiền đã được xử lý trước đó.",
              );
            }
          }
          await writeAuditLog(deps.db, deps.config, request, {
            action: `WITHDRAWAL_${input.decision}`,
            targetType: "WITHDRAWAL",
            targetId: id,
            reason: input.reason || "Xử lý hàng loạt",
          });
          success += 1;
        } catch (error) {
          failures.push(
            error instanceof AppError ? error.message : "Lỗi không xác định",
          );
        }
      }

      setFlash(
        reply,
        deps.config,
        failures.length ? "info" : "success",
        failures.length
          ? `Đã xử lý ${success}/${ids.length} yêu cầu. ${failures[0]}`
          : `Đã xử lý ${success} yêu cầu rút tiền.`,
      );
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/withdrawals");
  });

  // Hỗ trợ khách hàng vận hành hoàn toàn trên Slack (lịch sử, bản ghi, trả
  // lời đều ở đó). Backoffice chỉ giữ MỘT việc: cấu hình cách phản hồi —
  // thủ công qua Slack, trả lời mẫu, hoặc AI (kèm kho tài liệu tham khảo).
  app.get("/support", async (_request, reply) => {
    const [settings, kbDocuments] = await Promise.all([
      getAutoReplySettings(deps.db),
      listKbDocuments(deps.db),
    ]);
    return reply.view("backoffice/support-settings.njk", {
      pageTitle: "Hỗ trợ khách hàng",
      backofficeSection: "support",
      settings,
      kbDocuments,
      providers: AI_PROVIDERS,
    });
  });

  // Link cũ /support/settings vẫn dùng được.
  app.get("/support/settings", async (_request, reply) =>
    reply.redirect("/backoffice/support"),
  );

  const requireSupportManager = (role: string): void => {
    if (!["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role)) {
      throw new AppError(
        "FORBIDDEN",
        "Bạn không có quyền thay đổi cấu hình hỗ trợ.",
        403,
      );
    }
  };

  app.post("/support/settings", async (request, reply) => {
    try {
      requireSupportManager(request.currentUser!.role);
      const input = parseInput(
        z.object({
          mode: z.enum(["OFF", "CANNED", "AI"]),
          cannedMessage: z.string().trim().max(3000).optional().default(""),
          aiProvider: z.enum(["openai", "anthropic", "gemini"]),
          aiModel: z.string().trim().max(120).optional().default(""),
          aiSystemPrompt: z.string().trim().max(8000).optional().default(""),
          aiApiKey: z.string().trim().max(500).optional().default(""),
        }),
        request.body,
      );
      await saveAutoReplySettings(deps.db, deps.config, input);
      await writeAuditLog(deps.db, deps.config, request, {
        action: "SUPPORT_AUTOREPLY_UPDATED",
        targetType: "BUSINESS_CONFIG",
        targetId: "support_autoreply",
        after: { mode: input.mode, provider: input.aiProvider },
      });
      setFlash(reply, deps.config, "success", "Đã lưu cấu hình phản hồi.");
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/support");
  });

  app.post("/support/settings/kb", async (request, reply) => {
    try {
      requireSupportManager(request.currentUser!.role);
      const input = parseInput(
        z.object({
          title: z.string().trim().min(1).max(200),
          content: z.string().trim().min(10).max(20000),
        }),
        request.body,
      );
      await addKbDocument(deps.db, input);
      setFlash(reply, deps.config, "success", "Đã thêm tài liệu tham khảo.");
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/support");
  });

  app.post<{ Params: { id: string } }>(
    "/support/settings/kb/:id/delete",
    async (request, reply) => {
      try {
        requireSupportManager(request.currentUser!.role);
        const { id } = parseInput(
          z.object({ id: z.string().uuid() }),
          request.params,
        );
        const removed = await deleteKbDocument(deps.db, id);
        setFlash(
          reply,
          deps.config,
          removed ? "success" : "error",
          removed ? "Đã xóa tài liệu." : "Không tìm thấy tài liệu.",
        );
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/support");
    },
  );

  app.get("/audit", async (request, reply) => {
    const params = request.query as Record<string, unknown>;
    const actor = String(params.actor ?? "").trim().slice(0, 120);
    const targetType = selectedValue(
      ["ALL", ...AUDIT_TARGET_TYPES] as const,
      params.targetType,
      "ALL",
    );
    const tone = selectedValue(
      ["ALL", "POSITIVE", "NEGATIVE", "NEUTRAL"] as const,
      params.tone,
      "ALL",
    );
    const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(params.dateFrom ?? ""))
      ? String(params.dateFrom)
      : "";
    const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(params.dateTo ?? ""))
      ? String(params.dateTo)
      : "";

    const logs = await query<{
      id: string;
      actor_email: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      reason: string | null;
      request_id: string | null;
      before_redacted: unknown;
      after_redacted: unknown;
      created_at: Date;
    }>(
      deps.db,
      `
        SELECT a.id, u.email AS actor_email, a.action, a.target_type,
          a.target_id, a.reason, a.request_id,
          a.before_redacted, a.after_redacted, a.created_at
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE ($1 = '' OR u.email ILIKE '%' || $1 || '%')
          AND ($2 = 'ALL' OR a.target_type = $2)
          AND ($3 = '' OR a.created_at >= $3::date)
          AND ($4 = '' OR a.created_at < ($4::date + interval '1 day'))
        ORDER BY a.created_at DESC LIMIT 300
      `,
      [actor, targetType, dateFrom, dateTo],
    );
    const filteredByTone =
      tone === "ALL"
        ? logs.rows
        : logs.rows.filter(
            (row) => auditActionTone(row.action).toUpperCase() === tone,
          );

    return reply.view("backoffice/audit.njk", {
      pageTitle: "Nhật ký kiểm toán",
      backofficeSection: "audit",
      logs: filteredByTone,
      filters: { actor, targetType, tone, dateFrom, dateTo },
      targetTypeOptions: AUDIT_TARGET_TYPES,
    });
  });

  app.get("/config", async (_request, reply) => {
    const businessConfig = await getBusinessConfig(deps.db, deps.config);
    return reply.view("backoffice/config.njk", {
      pageTitle: "Cấu hình nghiệp vụ",
      backofficeSection: "config",
      businessConfig,
    });
  });

  app.post("/config", async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
      throw new AppError(
        "FORBIDDEN",
        "Chỉ quản trị viên mới được đổi cấu hình nghiệp vụ.",
        403,
      );
    }
    try {
      const input = parseInput(
        z.object({
          buyerCashbackPercent: z.coerce
            .number("Tỷ lệ người mua nhận phải là số.")
            .int()
            .min(0, "Tỷ lệ người mua nhận phải từ 0 đến 100.")
            .max(100, "Tỷ lệ người mua nhận phải từ 0 đến 100."),
          sharerRewardFromPlatformPercent: z.coerce
            .number("Tỷ lệ chủ link chia sẻ phải là số.")
            .int()
            .min(0, "Tỷ lệ chủ link chia sẻ phải từ 0 đến 100.")
            .max(100, "Tỷ lệ chủ link chia sẻ phải từ 0 đến 100."),
          referrerRewardAmountVnd: z.coerce
            .number("Số tiền thưởng người giới thiệu phải là số.")
            .int()
            .min(0, "Số tiền thưởng người giới thiệu không được âm."),
          referredUserBonusAmountVnd: z.coerce
            .number("Số tiền quà cho người mới phải là số.")
            .int()
            .min(0, "Số tiền quà cho người mới không được âm."),
          affiliateAttributionDays: z.coerce
            .number("Số ngày ghi nhận link phải là số.")
            .int()
            .min(1, "Số ngày ghi nhận link phải từ 1 đến 365.")
            .max(365, "Số ngày ghi nhận link phải từ 1 đến 365."),
          cashbackHoldDays: z.coerce
            .number("Số ngày giữ hoàn tiền phải là số.")
            .int()
            .min(0, "Số ngày giữ hoàn tiền phải từ 0 đến 365.")
            .max(365, "Số ngày giữ hoàn tiền phải từ 0 đến 365."),
          minWithdrawAmountVnd: z.coerce
            .number("Số tiền rút tối thiểu phải là số.")
            .int()
            .positive("Số tiền rút tối thiểu phải lớn hơn 0."),
          enableShareLink: z.coerce.boolean(),
          enableReferralProgram: z.coerce.boolean(),
          enableAutoCashbackApproval: z.coerce.boolean(),
        }),
        {
          ...(request.body as Record<string, unknown>),
          enableShareLink: (request.body as Record<string, unknown>).enableShareLink === "on",
          enableReferralProgram:
            (request.body as Record<string, unknown>).enableReferralProgram === "on",
          enableAutoCashbackApproval:
            (request.body as Record<string, unknown>).enableAutoCashbackApproval === "on",
        },
      );
      await updateBusinessConfig(deps.db, deps.config, request, input);
      setFlash(reply, deps.config, "success", "Đã lưu cấu hình nghiệp vụ. Có hiệu lực ngay cho các đơn tiếp theo.");
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/config");
  });

  // Xuất doanh thu ra file CSV (UTF-8 BOM — Excel mở trực tiếp, đúng tiếng Việt).
  app.get("/revenue/export", async (_request, reply) => {
    const [totals, daily] = await Promise.all([
      query<{
        commission_total: string;
        buyer_total: string;
        sharer_total: string;
        platform_total: string;
        orders_approved: string;
      }>(
        deps.db,
        `
          SELECT
            COALESCE(sum(o.commission_vnd), 0)::text AS commission_total,
            COALESCE(sum(ce.user_amount_vnd), 0)::text AS buyer_total,
            COALESCE(sum(ce.referral_amount_vnd), 0)::text AS sharer_total,
            COALESCE(sum(ce.platform_amount_vnd), 0)::text AS platform_total,
            count(DISTINCT ce.order_id)::text AS orders_approved
          FROM commission_entries ce
          JOIN orders o ON o.id = ce.order_id
          WHERE o.status = 'APPROVED' AND ce.status = 'AVAILABLE'
        `,
      ),
      query<{
        day: Date;
        orders_count: string;
        gmv_vnd: string;
        commission_vnd: string;
        platform_vnd: string;
      }>(
        deps.db,
        `
          SELECT date_trunc('day', o.approved_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
            count(DISTINCT o.id)::text AS orders_count,
            COALESCE(sum(o.order_amount_vnd), 0)::text AS gmv_vnd,
            COALESCE(sum(o.commission_vnd), 0)::text AS commission_vnd,
            COALESCE(sum(ce.platform_amount_vnd), 0)::text AS platform_vnd
          FROM orders o
          JOIN commission_entries ce ON ce.order_id = o.id
          WHERE o.status = 'APPROVED' AND ce.status = 'AVAILABLE'
            AND o.approved_at > now() - interval '90 days'
          GROUP BY 1 ORDER BY 1
        `,
      ),
    ]);

    const summary = totals.rows[0];
    const csvEscape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const lines: string[] = [
      "TỔNG QUAN DOANH THU SHOPTIK",
      `Xuất lúc;${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
      "",
      "Chỉ số;Giá trị (VND)",
      `Đơn đã duyệt;${summary?.orders_approved ?? "0"}`,
      `Tổng hoa hồng ghi nhận;${summary?.commission_total ?? "0"}`,
      `Đã hoàn cho người mua;${summary?.buyer_total ?? "0"}`,
      `Thưởng chủ link chia sẻ;${summary?.sharer_total ?? "0"}`,
      `Doanh thu nền tảng giữ lại;${summary?.platform_total ?? "0"}`,
      "",
      "DOANH THU THEO NGÀY (90 ngày gần nhất)",
      "Ngày;Số đơn;Giá trị đơn (VND);Hoa hồng (VND);Nền tảng giữ (VND)",
      ...daily.rows.map((row) =>
        [
          csvEscape(
            new Date(row.day).toLocaleDateString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            }),
          ),
          row.orders_count,
          row.gmv_vnd,
          row.commission_vnd,
          row.platform_vnd,
        ].join(";"),
      ),
    ];
    const today = new Date().toISOString().slice(0, 10);
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header(
        "content-disposition",
        `attachment; filename="doanh-thu-shoptik-${today}.csv"`,
      )
      .send(`﻿${lines.join("\r\n")}`);
  });

  app.get("/revenue", async (_request, reply) => {
    const [totals, last30, platformLedger, withdrawn, daily, topProducts] =
      await Promise.all([
        query<{
          orders_approved: string;
          commission_total: string;
          buyer_total: string;
          sharer_total: string;
          platform_total: string;
        }>(
          deps.db,
          `
            SELECT
              count(*) FILTER (WHERE o.status = 'APPROVED')::text AS orders_approved,
              COALESCE(sum(o.commission_vnd) FILTER (WHERE o.status = 'APPROVED'), 0)::text
                AS commission_total,
              COALESCE(sum(ce.user_amount_vnd) FILTER (WHERE ce.status = 'AVAILABLE'), 0)::text
                AS buyer_total,
              COALESCE(sum(ce.referral_amount_vnd) FILTER (WHERE ce.status = 'AVAILABLE'), 0)::text
                AS sharer_total,
              COALESCE(sum(ce.platform_amount_vnd) FILTER (WHERE ce.status = 'AVAILABLE'), 0)::text
                AS platform_total
            FROM orders o
            LEFT JOIN commission_entries ce ON ce.order_id = o.id
          `,
        ),
        query<{ orders_count: string; commission_vnd: string }>(
          deps.db,
          `
            SELECT count(*)::text AS orders_count,
              COALESCE(sum(commission_vnd), 0)::text AS commission_vnd
            FROM orders
            WHERE status = 'APPROVED' AND approved_at > now() - interval '30 days'
          `,
        ),
        query<{ balance_vnd: string }>(
          deps.db,
          `
            SELECT COALESCE(sum(
              CASE WHEN e.direction = 'CREDIT' THEN e.amount_vnd ELSE -e.amount_vnd END
            ), 0)::text AS balance_vnd
            FROM ledger_accounts a
            JOIN ledger_entries e ON e.account_id = a.id
            WHERE a.owner_type = 'SYSTEM' AND a.code = 'PLATFORM_REVENUE'
          `,
        ),
        query<{ paid_vnd: string }>(
          deps.db,
          `
            SELECT COALESCE(sum(amount_vnd), 0)::text AS paid_vnd
            FROM withdrawals WHERE status = 'PAID'
          `,
        ),
        query<{ day: Date; orders_count: string; commission_vnd: string }>(
          deps.db,
          `
            SELECT date_trunc('day', approved_at) AS day,
              count(*)::text AS orders_count,
              COALESCE(sum(commission_vnd), 0)::text AS commission_vnd
            FROM orders
            WHERE status = 'APPROVED' AND approved_at > now() - interval '14 days'
            GROUP BY 1
            ORDER BY 1 DESC
          `,
        ),
        query<{
          item_name: string;
          orders_count: string;
          amount_vnd: string;
        }>(
          deps.db,
          `
            SELECT oi.item_name,
              count(DISTINCT oi.order_id)::text AS orders_count,
              COALESCE(sum(oi.amount_vnd), 0)::text AS amount_vnd
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id AND o.status = 'APPROVED'
            GROUP BY oi.item_name
            ORDER BY count(DISTINCT oi.order_id) DESC, sum(oi.amount_vnd) DESC
            LIMIT 10
          `,
        ),
      ]);

    const totalsRow = totals.rows[0];
    const trendChart = buildTrendChart(
      daily.rows.map((row) => ({ day: row.day, value: row.commission_vnd })),
    );
    const splitBar = buildCommissionStackedBar(
      Number(totalsRow?.buyer_total ?? 0),
      Number(totalsRow?.sharer_total ?? 0),
      Number(totalsRow?.platform_total ?? 0),
    );
    const topProductsByOrders = buildBarList(
      topProducts.rows.map((row) => ({
        label: row.item_name,
        value: Number(row.orders_count),
      })),
      (value) => `${value} đơn`,
    );

    return reply.view("backoffice/revenue.njk", {
      pageTitle: "Doanh thu",
      backofficeSection: "revenue",
      totals: totalsRow,
      last30: last30.rows[0],
      platformBalance: platformLedger.rows[0]?.balance_vnd ?? "0",
      withdrawnPaid: withdrawn.rows[0]?.paid_vnd ?? "0",
      daily: daily.rows,
      topProducts: topProducts.rows,
      trendChart,
      splitBar,
      topProductsByOrders,
    });
  });

  app.get("/products", async (request, reply) => {
    const activeTab =
      (request.query as Record<string, unknown>).tab === "top-products"
        ? "top-products"
        : "content";
    const [content, topProducts] = await Promise.all([
      query<{
        id: string;
        type: string;
        title: string;
        description: string;
        target_url: string | null;
        image_url: string | null;
        badge: string | null;
        category: string;
        status: string;
        sort_order: number;
        published_at: Date;
        platform: string | null;
        price_vnd: string | null;
        original_price_vnd: string | null;
        cashback_rate_bps: number | null;
      }>(
        deps.db,
        `
          SELECT id, type, title, description, target_url, image_url, badge,
            category, status, sort_order, published_at, platform,
            price_vnd::text, original_price_vnd::text, cashback_rate_bps
          FROM content_items
          ORDER BY
            CASE status WHEN 'PUBLISHED' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
            sort_order, published_at DESC
        `,
      ),
      query<{
        item_name: string;
        platform: string;
        orders_count: string;
        amount_vnd: string;
        avg_unit_price_vnd: string;
        image_url: string | null;
      }>(
        deps.db,
        `
          SELECT oi.item_name, o.platform,
            count(DISTINCT oi.order_id)::text AS orders_count,
            COALESCE(sum(oi.amount_vnd), 0)::text AS amount_vnd,
            COALESCE(round(
              sum(oi.amount_vnd)::numeric / NULLIF(sum(oi.quantity), 0)
            ), 0)::text AS avg_unit_price_vnd,
            (array_agg(al.product_image_url)
              FILTER (WHERE al.product_image_url IS NOT NULL))[1] AS image_url
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id AND o.status = 'APPROVED'
          LEFT JOIN affiliate_links al ON al.id = o.affiliate_link_id
          GROUP BY oi.item_name, o.platform
          ORDER BY count(DISTINCT oi.order_id) DESC, sum(oi.amount_vnd) DESC
          LIMIT 20
        `,
      ),
    ]);

    const topProductsByRevenue = buildBarList(
      topProducts.rows.map((row) => ({
        label: row.item_name,
        value: Number(row.amount_vnd),
      })),
      (value) => formatVnd(value),
    );

    return reply.view("backoffice/products.njk", {
      pageTitle: "Sản phẩm",
      backofficeSection: "products",
      activeTab,
      content: content.rows,
      topProducts: topProducts.rows,
      topProductsByRevenue,
    });
  });

  app.post("/products", async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
      throw new AppError("FORBIDDEN", "Bạn không có quyền tạo nội dung.", 403);
    }

    let storedImagePath: string | null = null;
    try {
      const rawBody =
        request.body && typeof request.body === "object"
          ? (request.body as Record<string, unknown>)
          : {};
      const { input, cashbackRateBps } = parseContentItemInput(rawBody);

      const uploadedImage = Buffer.isBuffer(rawBody.imageFile)
        ? rawBody.imageFile
        : null;
      const storedImage =
        uploadedImage && uploadedImage.length > 0
          ? await saveContentImage(uploadedImage)
          : null;
      storedImagePath = storedImage?.absolutePath ?? null;
      const imageUrl = storedImage?.url ?? normalizeContentImageUrl(input.imageUrl);
      const targetUrl = normalizeContentTargetUrl(input.targetUrl);

      await query(
        deps.db,
        `
          INSERT INTO content_items (
            type, title, description, target_url, image_url, badge, category,
            sort_order, platform, price_vnd, original_price_vnd,
            cashback_rate_bps, status
          ) VALUES (
            $1, $2, $3, NULLIF($4, ''), $5, NULLIF($6, ''), $7, $8,
            $9, $10, $11, $12, 'PUBLISHED'
          )
        `,
        [
          input.type,
          input.title,
          input.description,
          targetUrl,
          imageUrl,
          input.badge,
          input.category,
          input.sortOrder,
          input.platform ?? null,
          input.priceVnd ?? null,
          input.originalPriceVnd ?? null,
          cashbackRateBps ?? null,
        ],
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "CONTENT_ITEM_CREATED",
        targetType: "CONTENT_ITEM",
        after: {
          title: input.title,
          type: input.type,
          category: input.category,
          hasImage: Boolean(imageUrl),
        },
      });
      setFlash(reply, deps.config, "success", "Đã đăng nội dung Khám phá.");
    } catch (error) {
      await removeContentImage(storedImagePath);
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/products");
  });

  app.post<{ Params: { id: string } }>(
    "/products/:id/edit",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền sửa nội dung.", 403);
      }

      let storedImagePath: string | null = null;
      try {
        const current = await query<{ image_url: string | null }>(
          deps.db,
          "SELECT image_url FROM content_items WHERE id = $1",
          [request.params.id],
        );
        const currentRow = current.rows[0];
        if (!currentRow) {
          throw new AppError("CONTENT_NOT_FOUND", "Không tìm thấy nội dung.");
        }

        const rawBody =
          request.body && typeof request.body === "object"
            ? (request.body as Record<string, unknown>)
            : {};
        const { input, cashbackRateBps } = parseContentItemInput(rawBody);

        const uploadedImage = Buffer.isBuffer(rawBody.imageFile)
          ? rawBody.imageFile
          : null;
        const storedImage =
          uploadedImage && uploadedImage.length > 0
            ? await saveContentImage(uploadedImage)
            : null;
        storedImagePath = storedImage?.absolutePath ?? null;
        // Không tải ảnh mới và không nhập link ảnh mới → giữ nguyên ảnh cũ,
        // không bắt admin đăng lại ảnh mỗi lần sửa chữ.
        const newImageUrl =
          storedImage?.url ?? normalizeContentImageUrl(input.imageUrl);
        const imageUrl = newImageUrl ?? currentRow.image_url;
        const targetUrl = normalizeContentTargetUrl(input.targetUrl);

        await query(
          deps.db,
          `
            UPDATE content_items SET
              type = $2, title = $3, description = $4, target_url = $5,
              image_url = $6, badge = $7, category = $8, sort_order = $9,
              platform = $10, price_vnd = $11, original_price_vnd = $12,
              cashback_rate_bps = $13
            WHERE id = $1
          `,
          [
            request.params.id,
            input.type,
            input.title,
            input.description,
            targetUrl,
            imageUrl,
            input.badge,
            input.category,
            input.sortOrder,
            input.platform ?? null,
            input.priceVnd ?? null,
            input.originalPriceVnd ?? null,
            cashbackRateBps ?? null,
          ],
        );

        // Ảnh cũ do hệ thống lưu và đã bị thay bằng ảnh mới → dọn file cũ.
        const uploadPrefix = "/assets/uploads/discover/";
        if (
          storedImage &&
          currentRow.image_url?.startsWith(uploadPrefix) &&
          currentRow.image_url !== imageUrl
        ) {
          const fileName = currentRow.image_url.slice(uploadPrefix.length);
          await removeContentImage(
            path.join(process.cwd(), "public", "uploads", "discover", fileName),
          );
        }

        await writeAuditLog(deps.db, deps.config, request, {
          action: "CONTENT_ITEM_UPDATED",
          targetType: "CONTENT_ITEM",
          targetId: request.params.id,
          after: {
            title: input.title,
            type: input.type,
            category: input.category,
            hasImage: Boolean(imageUrl),
          },
        });
        setFlash(reply, deps.config, "success", "Đã cập nhật nội dung Khám phá.");
      } catch (error) {
        await removeContentImage(storedImagePath);
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/products");
    },
  );

  app.post<{ Params: { id: string } }>(
    "/products/:id/status",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền sửa nội dung.", 403);
      }
      try {
        const input = parseInput(
          z.object({ status: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED"]) }),
          request.body,
        );
        const updated = await query(
          deps.db,
          "UPDATE content_items SET status = $2 WHERE id = $1",
          [request.params.id, input.status],
        );
        if (!updated.rowCount) {
          throw new AppError("CONTENT_NOT_FOUND", "Không tìm thấy nội dung.");
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: "CONTENT_ITEM_STATUS_CHANGED",
          targetType: "CONTENT_ITEM",
          targetId: request.params.id,
          after: { status: input.status },
        });
        setFlash(reply, deps.config, "success", "Đã cập nhật trạng thái nội dung.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/products");
    },
  );

  app.post<{ Params: { id: string } }>(
    "/products/:id/delete",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền xóa nội dung.", 403);
      }
      try {
        const existing = await query<{
          title: string;
          type: string;
          image_url: string | null;
        }>(
          deps.db,
          "SELECT title, type, image_url FROM content_items WHERE id = $1",
          [request.params.id],
        );
        const row = existing.rows[0];
        if (!row) {
          throw new AppError("CONTENT_NOT_FOUND", "Không tìm thấy nội dung.");
        }
        await query(deps.db, "DELETE FROM content_items WHERE id = $1", [
          request.params.id,
        ]);
        // Chỉ xóa file vật lý nếu ảnh do chính hệ thống lưu (link ảnh ngoài
        // không đụng tới ổ đĩa).
        const uploadPrefix = "/assets/uploads/discover/";
        if (row.image_url?.startsWith(uploadPrefix)) {
          const fileName = row.image_url.slice(uploadPrefix.length);
          await removeContentImage(
            path.join(process.cwd(), "public", "uploads", "discover", fileName),
          );
        }
        await writeAuditLog(deps.db, deps.config, request, {
          action: "CONTENT_ITEM_DELETED",
          targetType: "CONTENT_ITEM",
          targetId: request.params.id,
          before: { title: row.title, type: row.type },
        });
        setFlash(reply, deps.config, "success", "Đã xóa nội dung Khám phá.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/products");
    },
  );

  app.get("/missions", async (_request, reply) => {
    const [definitions, pendingClaims, recentClaims] = await Promise.all([
      listMissionDefinitions(deps.db),
      listMissionClaims(deps.db, "PENDING"),
      listMissionClaims(deps.db),
    ]);
    return reply.view("backoffice/missions.njk", {
      pageTitle: "Nhiệm vụ",
      backofficeSection: "missions",
      definitions,
      pendingClaims,
      recentClaims: recentClaims.slice(0, 50),
    });
  });

  app.post("/missions", async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
      throw new AppError("FORBIDDEN", "Bạn không có quyền tạo nhiệm vụ.", 403);
    }
    try {
      const input = parseInput(MISSION_DEFINITION_SCHEMA, request.body);
      await createMissionDefinition(deps.db, deps.config, request, input);
      setFlash(reply, deps.config, "success", "Đã tạo mốc nhiệm vụ.");
    } catch (error) {
      flashError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/missions");
  });

  app.post<{ Params: { id: string } }>(
    "/missions/:id/edit",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền sửa nhiệm vụ.", 403);
      }
      try {
        const input = parseInput(MISSION_DEFINITION_SCHEMA, request.body);
        await updateMissionDefinition(
          deps.db,
          deps.config,
          request,
          request.params.id,
          input,
        );
        setFlash(reply, deps.config, "success", "Đã cập nhật mốc nhiệm vụ.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/missions");
    },
  );

  app.post<{ Params: { id: string } }>(
    "/missions/:id/delete",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền xóa nhiệm vụ.", 403);
      }
      try {
        await deleteMissionDefinition(deps.db, deps.config, request, request.params.id);
        setFlash(reply, deps.config, "success", "Đã xóa mốc nhiệm vụ.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/missions");
    },
  );

  app.post<{ Params: { id: string } }>(
    "/missions/claims/:id/approve",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền duyệt thưởng.", 403);
      }
      try {
        await approveMissionClaim(deps.db, deps.config, request, request.params.id);
        setFlash(
          reply,
          deps.config,
          "success",
          "Đã duyệt và cộng thưởng vào ví người dùng.",
        );
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/missions");
    },
  );

  app.post<{ Params: { id: string } }>(
    "/missions/claims/:id/reject",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)) {
        throw new AppError("FORBIDDEN", "Bạn không có quyền từ chối yêu cầu.", 403);
      }
      try {
        await rejectMissionClaim(deps.db, deps.config, request, request.params.id);
        setFlash(reply, deps.config, "success", "Đã từ chối yêu cầu nhận thưởng.");
      } catch (error) {
        flashError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/missions");
    },
  );
}
