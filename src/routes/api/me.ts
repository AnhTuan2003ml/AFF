import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import {
  listUserSessions,
  revokeAllUserSessions,
} from "../../auth/session.js";
import { query } from "../../db.js";
import { AppError } from "../../lib/errors.js";
import { parseInput } from "../../lib/validation.js";
import { deleteOwnAccount } from "../../services/account-deletion.js";
import { writeAuditLog } from "../../services/audit.js";
import {
  BANKS,
  confirmBankChange,
  requestBankChange,
} from "../../services/bank.js";
import { createWithdrawalFromIntent } from "../../services/ledger.js";
import {
  requestWithdrawal,
  verifyWithdrawalOtp,
} from "../../services/withdrawal.js";
import type { ApiDeps } from "./deps.js";

/**
 * Nhánh ví và tài khoản cho app di động.
 *
 * Trên web, những việc này nằm ở các form trong routes/app.ts và kết thúc bằng
 * redirect + flash message — app không dùng được. Các route dưới đây là lớp vỏ
 * JSON mỏng, GỌI LẠI đúng service mà web đang gọi. Tuyệt đối không chép lại
 * logic: nếu luật rút tiền tách đôi giữa web và app thì sớm muộn hai bên lệch
 * nhau, và lệch ở đây là lệch tiền.
 *
 * Hai luồng ngân hàng và rút tiền đều gồm HAI bước, y hệt web:
 *   1. Gửi yêu cầu  → hệ thống tạo bản ghi tạm và gửi OTP qua email
 *   2. Gửi mã OTP   → mới thực sự tạo tài khoản ngân hàng / lệnh rút
 */

const otpCode = z.string().trim().regex(/^\d{6}$/, "Mã OTP gồm 6 chữ số.");

export async function registerMeApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  /* ---------------------------- Ngân hàng ---------------------------- */

  app.get(
    "/me/bank-accounts",
    { preHandler: requireApiUser },
    async (request) => {
      const accounts = await query(
        deps.db,
        `
          SELECT id, bank_code, account_last4, account_name_masked,
            status, verified_at, created_at
          FROM user_bank_accounts
          WHERE user_id = $1 AND status <> 'DISABLED'
          ORDER BY verified_at DESC NULLS LAST, created_at DESC
        `,
        [request.currentUser!.id],
      );
      // Kèm luôn danh sách ngân hàng hỗ trợ để app khỏi hardcode — đổi ở
      // services/bank.ts là app thấy ngay sau lần mở màn hình kế tiếp.
      return { data: accounts.rows, supportedBanks: BANKS };
    },
  );

  app.post(
    "/me/bank-accounts",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          bankCode: z.string().trim().min(2).max(10),
          accountNumber: z.string().trim().regex(/^\d{6,20}$/),
          accountName: z.string().trim().min(3).max(100),
        }),
        request.body,
      );
      const requestId = await requestBankChange(
        deps.db,
        deps.emailService,
        deps.config,
        {
          userId: request.currentUser!.id,
          email: request.currentUser!.email,
          ...input,
        },
      );
      return reply.code(202).send({
        requestId,
        status: "OTP_REQUIRED",
        message: "Mã xác nhận đã được gửi tới email của bạn.",
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/me/bank-accounts/:id/confirm",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = parseInput(z.object({ code: otpCode }), request.body);
      const bankAccountId = await confirmBankChange(deps.db, deps.config, {
        requestId: request.params.id,
        userId: request.currentUser!.id,
        email: request.currentUser!.email,
        code: input.code,
      });
      await writeAuditLog(deps.db, deps.config, request, {
        action: "BANK_ACCOUNT_ADDED",
        targetType: "BANK_ACCOUNT",
        targetId: bankAccountId,
      });
      return reply.code(201).send({ bankAccountId, status: "VERIFIED" });
    },
  );

  /* ----------------------------- Rút tiền ---------------------------- */

  app.post(
    "/me/withdrawals",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          bankAccountId: z.string().uuid("Tài khoản ngân hàng chưa hợp lệ."),
          amountVnd: z.coerce.number().int().positive("Số tiền chưa hợp lệ."),
        }),
        request.body,
      );
      const intentId = await requestWithdrawal(
        deps.db,
        deps.emailService,
        deps.config,
        {
          userId: request.currentUser!.id,
          email: request.currentUser!.email,
          bankAccountId: input.bankAccountId,
          amountVnd: input.amountVnd,
        },
      );
      return reply.code(202).send({
        intentId,
        status: "OTP_REQUIRED",
        message: "Mã xác nhận đã được gửi tới email của bạn.",
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/me/withdrawals/:id/confirm",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (request, reply) => {
      const input = parseInput(z.object({ code: otpCode }), request.body);
      await verifyWithdrawalOtp(deps.db, deps.config, {
        intentId: request.params.id,
        userId: request.currentUser!.id,
        email: request.currentUser!.email,
        code: input.code,
      });
      const withdrawalId = await createWithdrawalFromIntent(
        deps.db,
        request.params.id,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "WITHDRAWAL_CREATED",
        targetType: "WITHDRAWAL",
        targetId: withdrawalId,
      });
      return reply.code(201).send({
        withdrawalId,
        status: "REQUESTED",
        message: "Yêu cầu rút tiền đã được tạo và đang chờ kiểm tra.",
      });
    },
  );

  /* ----------------------------- Tài khoản --------------------------- */

  app.patch("/me", { preHandler: requireApiUser }, async (request) => {
    const input = parseInput(
      z.object({ fullName: z.string().trim().min(2).max(100) }),
      request.body,
    );
    const updated = await query<{
      id: string;
      email: string;
      full_name: string;
      role: string;
    }>(
      deps.db,
      `
        UPDATE users
        SET full_name = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, email, full_name, role
      `,
      [request.currentUser!.id, input.fullName],
    );
    const row = updated.rows[0];
    if (!row) {
      throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
    }
    return {
      user: {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
      },
    };
  });

  // Đăng xuất mọi thiết bị, kể cả thiết bị đang gọi — nên sau lệnh này app
  // phải đưa người dùng về màn hình đăng nhập.
  app.get("/me/sessions", { preHandler: requireApiUser }, async (request, reply) => {
    reply.header("cache-control", "private, no-store");
    const data = await listUserSessions(
      deps.db,
      request.currentUser!.id,
      request.sessionToken ?? null,
    );
    return { data };
  });

  app.post(
    "/me/sessions/revoke-all",
    { preHandler: requireApiUser },
    async (request, reply) => {
      await revokeAllUserSessions(deps.db, request.currentUser!.id);
      await writeAuditLog(deps.db, deps.config, request, {
        action: "SESSIONS_REVOKED_ALL",
        targetType: "USER",
        targetId: request.currentUser!.id,
      });
      return reply.code(204).send();
    },
  );

  app.delete(
    "/me",
    {
      preHandler: requireApiUser,
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          forfeitBalance: z.boolean().optional().default(false),
          password: z.string().max(200).optional(),
        }),
        request.body ?? {},
      );
      const userId = request.currentUser!.id;
      const result = await deleteOwnAccount(deps.db, {
        userId,
        forfeitBalance: input.forfeitBalance,
        password: input.password,
      });
      // Ghi nhật ký SAU khi xóa thành công, nếu không thì mỗi lần bị chặn
      // (còn lệnh rút, còn số dư) cũng để lại một dòng "đã xóa tài khoản" sai
      // sự thật. Xóa mềm nên dòng users vẫn còn, khóa ngoại actor vẫn hợp lệ.
      await writeAuditLog(deps.db, deps.config, request, {
        action: "ACCOUNT_DELETED_BY_USER",
        targetType: "USER",
        targetId: userId,
        reason: `Số dư bị bỏ lại: ${result.forfeitedVnd}`,
      });
      return reply.code(200).send({
        status: "DELETED",
        forfeitedVnd: result.forfeitedVnd,
      });
    },
  );
}
