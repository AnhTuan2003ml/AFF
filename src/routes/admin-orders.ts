import type { FastifyInstance, FastifyRequest } from "fastify";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { query } from "../db.js";
import { AppError } from "../lib/errors.js";
import { setFlash } from "../lib/flash.js";
import { parseInput } from "../lib/validation.js";
import { writeAuditLog } from "../services/audit.js";
import { getBusinessConfig } from "../services/business-config.js";
import {
  importOrderRow,
  normalizeOrderImportRecord,
  type OrderImportRow,
} from "../services/order-import.js";
import {
  flashAdminError,
  pageNumber,
  selectedValue,
  type AdminConsoleDeps,
} from "./admin-console-shared.js";

interface OrderReviewRow {
  platform: string;
  platform_order_id: string;
  status: string;
  order_amount_vnd: string;
  commission_vnd: string;
  click_id: string | null;
  buyer_email: string;
  sharer_email: string | null;
  purchased_at: Date | null;
  evidence_status: string;
}

const idsFromBody = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
};

function detectCsvDelimiter(csvData: string): string {
  const firstLine = csvData.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"] as const;
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ",";
}

async function reviewCashbackOrder(
  deps: AdminConsoleDeps,
  request: FastifyRequest,
  params: {
    orderId: string;
    decision: "APPROVED" | "INVALID";
    reason: string;
    auditAction?: "CASHBACK_APPROVED" | "CASHBACK_REJECTED" | "CASHBACK_AUTO_APPROVED";
  },
): Promise<void> {
  const result = await query<OrderReviewRow>(
    deps.db,
    `
      SELECT o.platform, o.platform_order_id, o.status, o.order_amount_vnd::text,
        o.commission_vnd::text, l.click_id, buyer.email AS buyer_email,
        sharer.email AS sharer_email, o.purchased_at, o.evidence_status
      FROM orders o
      JOIN users buyer ON buyer.id = o.user_id
      LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
      LEFT JOIN commission_entries ce ON ce.order_id = o.id
      LEFT JOIN users sharer ON sharer.id = ce.sharer_user_id
      WHERE o.id = $1 LIMIT 1
    `,
    [params.orderId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError("ORDER_NOT_FOUND", "Không tìm thấy đơn hàng.");
  }
  if (row.status !== "PENDING") {
    throw new AppError(
      "ORDER_ALREADY_REVIEWED",
      "Đơn này đã được xử lý trước đó.",
    );
  }
  if (params.decision === "APPROVED" && row.evidence_status !== "VERIFIED") {
    throw new AppError(
      "ORDER_EVIDENCE_REQUIRED",
      "Không thể duyệt hoàn tiền: đơn chưa có chuỗi bằng chứng Sub ID/Click ID khớp với tài khoản ShopTik.",
    );
  }
  await importOrderRow(
    deps.db,
    deps.config,
    {
      platform: row.platform,
      platform_order_id: row.platform_order_id,
      status: params.decision,
      order_amount_vnd: row.order_amount_vnd,
      commission_vnd: row.commission_vnd,
      ...(row.click_id ? { click_id: row.click_id } : { email: row.buyer_email }),
      ...(row.sharer_email ? { sharer_email: row.sharer_email } : {}),
      ...(row.purchased_at ? { purchased_at: row.purchased_at.toISOString() } : {}),
    },
    request.currentUser!.id,
  );
  await query(
    deps.db,
    `
      UPDATE orders
      SET reviewed_by = $2, reviewed_at = now(),
        review_reason = NULLIF($3, '')
      WHERE id = $1
    `,
    [params.orderId, request.currentUser!.id, params.reason],
  );
  await writeAuditLog(deps.db, deps.config, request, {
    action:
      params.auditAction ??
      (params.decision === "APPROVED" ? "CASHBACK_APPROVED" : "CASHBACK_REJECTED"),
    targetType: "ORDER",
    targetId: params.orderId,
    reason: params.reason,
    before: { status: row.status },
    after: { status: params.decision },
  });
}

export async function registerAdminOrderRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/reconciliation", async (request, reply) => {
    const params = request.query as Record<string, unknown>;
    const status = selectedValue(
      [
        "ALL",
        "PENDING",
        "APPROVED",
        "INVALID",
        "CANCELLED",
        "REVERSED",
      ] as const,
      params.status,
      "ALL",
    );
    const q = String(params.q ?? "").trim().slice(0, 120);
    const page = pageNumber(params.page);
    const limit = 20;
    const offset = (page - 1) * limit;
    const [orders, summary, businessConfig] = await Promise.all([
      query<{
        id: string;
        platform_order_id: string;
        click_id: string | null;
        sub_id: string | null;
        product_name: string | null;
        clicked_product_name: string | null;
        item_source: string | null;
        attribution_method: string | null;
        attribution_value: string | null;
        attributed_at: Date | null;
        evidence_status: string;
        evidence_verified_at: Date | null;
        affiliate_id: string | null;
        link_created_at: Date | null;
        first_click_at: Date | null;
        last_click_at: Date | null;
        valid_click_count: string;
        raw_source: string | null;
        raw_checksum: string | null;
        raw_received_at: Date | null;
        email: string;
        full_name: string;
        status: string;
        order_amount_vnd: string;
        commission_vnd: string;
        cashback_vnd: string;
        review_reason: string | null;
        reviewer_email: string | null;
        purchased_at: Date | null;
        updated_at: Date;
        total_count: string;
      }>(
        deps.db,
        `
          SELECT o.id, o.platform_order_id, l.click_id, l.sub_id,
            COALESCE(oi.item_name, l.product_name) AS product_name,
            l.product_name AS clicked_product_name, oi.source AS item_source,
            o.attribution_method, o.attribution_value, o.attributed_at,
            o.evidence_status, o.evidence_verified_at, p.affiliate_id,
            l.created_at AS link_created_at, clicks.first_click_at,
            clicks.last_click_at, COALESCE(clicks.valid_click_count, 0)::text
              AS valid_click_count,
            raw.source AS raw_source, raw.checksum AS raw_checksum,
            raw.received_at AS raw_received_at,
            u.email, u.full_name, o.status, o.order_amount_vnd::text,
            o.commission_vnd::text, o.cashback_vnd::text, o.review_reason,
            reviewer.email AS reviewer_email, o.purchased_at, o.updated_at,
            count(*) OVER()::text AS total_count
          FROM orders o
          JOIN users u ON u.id = o.user_id
          LEFT JOIN affiliate_links l ON l.id = o.affiliate_link_id
          LEFT JOIN affiliate_programs p ON p.id = l.program_id
          LEFT JOIN conversion_raw raw ON raw.id = o.raw_conversion_id
          LEFT JOIN LATERAL (
            SELECT item_name, source
            FROM order_items
            WHERE order_id = o.id
            ORDER BY CASE source WHEN 'REPORT' THEN 0 ELSE 1 END, id
            LIMIT 1
          ) oi ON true
          LEFT JOIN LATERAL (
            SELECT min(occurred_at) FILTER (WHERE bot_flag = false) AS first_click_at,
              max(occurred_at) FILTER (WHERE bot_flag = false) AS last_click_at,
              count(*) FILTER (WHERE bot_flag = false) AS valid_click_count
            FROM click_events
            WHERE affiliate_link_id = l.id
          ) clicks ON true
          LEFT JOIN users reviewer ON reviewer.id = o.reviewed_by
          WHERE ($1 = 'ALL' OR o.status = $1)
            AND (
              $2 = '' OR o.platform_order_id ILIKE '%' || $2 || '%'
              OR u.email ILIKE '%' || $2 || '%'
              OR u.full_name ILIKE '%' || $2 || '%'
              OR COALESCE(l.click_id, '') ILIKE '%' || $2 || '%'
              OR COALESCE(l.sub_id, '') ILIKE '%' || $2 || '%'
              OR COALESCE(o.attribution_value, '') ILIKE '%' || $2 || '%'
              OR COALESCE(p.affiliate_id, '') ILIKE '%' || $2 || '%'
              OR COALESCE(oi.item_name, l.product_name, '') ILIKE '%' || $2 || '%'
            )
          ORDER BY CASE o.status WHEN 'PENDING' THEN 0 ELSE 1 END,
            o.updated_at DESC
          LIMIT $3 OFFSET $4
        `,
        [status, q, limit, offset],
      ),
      query<{
        pending: string;
        verified: string;
        manual_review: string;
        approved: string;
        rejected: string;
        raw_errors: string;
        approved_commission_vnd: string;
      }>(
        deps.db,
        `
          SELECT
            count(*) FILTER (WHERE status = 'PENDING')::text AS pending,
            count(*) FILTER (WHERE evidence_status = 'VERIFIED')::text AS verified,
            count(*) FILTER (WHERE evidence_status = 'MANUAL_REVIEW')::text
              AS manual_review,
            count(*) FILTER (WHERE status = 'APPROVED')::text AS approved,
            count(*) FILTER (
              WHERE status IN ('INVALID', 'CANCELLED', 'REVERSED')
            )::text AS rejected,
            (SELECT count(*) FROM conversion_raw
              WHERE processing_error IS NOT NULL)::text AS raw_errors,
            COALESCE(sum(commission_vnd) FILTER (
              WHERE status = 'APPROVED'
            ), 0)::text AS approved_commission_vnd
          FROM orders
        `,
      ),
      getBusinessConfig(deps.db, deps.config),
    ]);
    const total = Number(orders.rows[0]?.total_count ?? 0);
    return reply.view("backoffice/reconciliation-v2.njk", {
      pageTitle: "Đơn và đối soát",
      backofficeSection: "orders",
      orders: orders.rows,
      summary: summary.rows[0],
      autoCashbackEnabled: businessConfig.enableAutoCashbackApproval,
      filters: { q, status },
      pagination: {
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        total,
      },
    });
  });

  app.post("/reconciliation/import", async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)) {
      throw new AppError("FORBIDDEN", "Bạn không có quyền nhập đơn.", 403);
    }
    try {
      const input = parseInput(
        z.object({
          csvData: z
            .string()
            .min(10, "Hãy chọn hoặc dán file CSV.")
            .max(64 * 1024, "File CSV vượt quá 64 KB."),
        }),
        request.body,
      );
      let records: OrderImportRow[];
      try {
        const rawRecords = parse(input.csvData, {
          columns: true,
          bom: true,
          delimiter: detectCsvDelimiter(input.csvData),
          relax_column_count: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, unknown>[];
        records = rawRecords.map(normalizeOrderImportRecord);
      } catch {
        throw new AppError(
          "IMPORT_FORMAT_INVALID",
          "File CSV không đúng định dạng. Hãy kiểm tra lại dòng tiêu đề cột và dấu phẩy phân tách.",
        );
      }
      if (records.length > 500) {
        throw new AppError(
          "IMPORT_TOO_LARGE",
          "Mỗi lần chỉ nhập tối đa 500 dòng.",
        );
      }
      const businessConfig = await getBusinessConfig(deps.db, deps.config);
      let success = 0;
      let autoApproved = 0;
      const failures: string[] = [];
      for (const [index, row] of records.entries()) {
        try {
          const hasTrackingEvidence = Boolean(
            row.click_id ||
              row.sub_id ||
              row.sub_id1 ||
              row.sub_id2 ||
              row.sub_id3 ||
              row.sub_id4 ||
              row.sub_id5,
          );
          const shouldAutoApprove =
            businessConfig.enableAutoCashbackApproval &&
            row.status === "PENDING" &&
            hasTrackingEvidence;
          const imported = await importOrderRow(
            deps.db,
            deps.config,
            shouldAutoApprove ? { ...row, status: "APPROVED" } : row,
            request.currentUser!.id,
          );
          if (shouldAutoApprove) {
            autoApproved += 1;
            await query(
              deps.db,
              `
                UPDATE orders
                SET reviewed_by = $2, reviewed_at = now(),
                  review_reason = 'Tự động duyệt theo cấu hình hệ thống'
                WHERE id = $1
              `,
              [imported.orderId, request.currentUser!.id],
            );
            await writeAuditLog(deps.db, deps.config, request, {
              action: "CASHBACK_AUTO_APPROVED",
              targetType: "ORDER",
              targetId: imported.orderId,
              reason: "Tự động duyệt theo cấu hình hệ thống",
              before: { status: "PENDING" },
              after: { status: "APPROVED" },
            });
          }
          success += 1;
        } catch (error) {
          failures.push(
            `Dòng ${index + 2}: ${
              error instanceof AppError ? error.message : "Lỗi không xác định"
            }`,
          );
        }
      }
      await writeAuditLog(deps.db, deps.config, request, {
        action: "ORDERS_IMPORTED",
        targetType: "ORDER_BATCH",
        reason: `Thành công ${success}, lỗi ${failures.length}`,
        after: { success, failed: failures.length },
      });
      setFlash(
        reply,
        deps.config,
        failures.length ? "info" : "success",
        failures.length
          ? `Đã nhập ${success} đơn; ${failures.length} dòng cần kiểm tra. ${failures[0]}`
          : `Đã nhập và đối soát ${success} đơn.`,
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/reconciliation");
  });

  app.post("/reconciliation/bulk-decision", async (request, reply) => {
    if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)) {
      throw new AppError(
        "FORBIDDEN",
        "Bạn không có quyền duyệt hoàn tiền.",
        403,
      );
    }
    try {
      const body = request.body as Record<string, unknown>;
      const input = parseInput(
        z.object({
          decision: z.enum(["APPROVED", "INVALID"]),
          scope: z.enum(["selected", "all_pending"]).optional().default("selected"),
          reason: z.string().trim().max(500).optional().default(""),
        }),
        body,
      );
      if (input.decision === "INVALID" && input.reason.length < 5) {
        throw new AppError(
          "REASON_REQUIRED",
          "Hãy nhập lý do từ chối rõ ràng, ít nhất 5 ký tự.",
        );
      }

      let ids =
        input.scope === "all_pending" ? [] : idsFromBody(body.ids);
      if (input.scope === "all_pending") {
        const pending = await query<{ id: string }>(
          deps.db,
          `
            SELECT id FROM orders
            WHERE status = 'PENDING'
              AND evidence_status = 'VERIFIED'
            ORDER BY updated_at ASC
            LIMIT 500
          `,
        );
        ids = pending.rows.map((row) => row.id);
      }
      if (!ids.length) {
        throw new AppError(
          "NO_ORDER_SELECTED",
          "Hãy chọn ít nhất một đơn cần xử lý.",
        );
      }

      let success = 0;
      const failures: string[] = [];
      for (const id of ids) {
        try {
          await reviewCashbackOrder(deps, request, {
            orderId: id,
            decision: input.decision,
            reason:
              input.reason ||
              (input.scope === "all_pending"
                ? "Duyệt tất cả đơn đang chờ"
                : "Duyệt hàng loạt"),
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
          ? `Đã xử lý ${success}/${ids.length} đơn. ${failures[0]}`
          : `Đã xử lý ${success} đơn.`,
      );
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/reconciliation?status=PENDING");
  });

  app.post<{ Params: { id: string } }>(
    "/reconciliation/:id/decision",
    async (request, reply) => {
      if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(request.currentUser!.role)) {
        throw new AppError(
          "FORBIDDEN",
          "Bạn không có quyền duyệt hoàn tiền.",
          403,
        );
      }
      try {
        const input = parseInput(
          z.object({
            decision: z.enum(["APPROVED", "INVALID"]),
            reason: z.string().trim().max(500).optional().default(""),
          }),
          request.body,
        );
        if (input.decision === "INVALID" && input.reason.length < 5) {
          throw new AppError(
            "REASON_REQUIRED",
            "Hãy nhập lý do từ chối rõ ràng, ít nhất 5 ký tự.",
          );
        }
        await reviewCashbackOrder(deps, request, {
          orderId: request.params.id,
          decision: input.decision,
          reason: input.reason,
        });
        setFlash(
          reply,
          deps.config,
          "success",
          input.decision === "APPROVED"
            ? "Đã duyệt hoàn tiền và chuyển số dư sang khả dụng."
            : "Đã từ chối hoàn tiền và ghi nhận lý do.",
        );
      } catch (error) {
        flashAdminError(reply, deps.config, error);
      }
      return reply.redirect("/backoffice/reconciliation?status=PENDING");
    },
  );
}
