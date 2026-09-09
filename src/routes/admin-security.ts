import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseInput } from "../lib/validation.js";
import {
  confirmEnroll,
  countBackupCodes,
  disable2fa,
  get2faState,
  regenerateBackupCodes,
  startEnroll,
  verifyUserTotp,
} from "../services/admin-2fa.js";
import { writeAuditLog } from "../services/audit.js";
import {
  flashAdminError,
  type AdminConsoleDeps,
} from "./admin-console-shared.js";
import { setFlash } from "../lib/flash.js";

const tokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Mã xác thực gồm đúng 6 chữ số."),
});

/**
 * Bảo mật cá nhân của quản trị viên: bật/tắt xác thực hai lớp (TOTP). Đã nằm
 * trong khu console (preHandler yêu cầu vai trò ADMIN) nên mọi route ở đây chỉ
 * dành cho tài khoản quản trị đang đăng nhập.
 */
export async function registerAdminSecurityRoutes(
  app: FastifyInstance,
  deps: AdminConsoleDeps,
): Promise<void> {
  app.get("/security", async (request, reply) => {
    const user = request.currentUser!;
    const state = await get2faState(deps.db, user.id);
    const setup = (request.query as Record<string, unknown>)?.setup === "1";
    // Chỉ sinh secret mới khi người dùng bấm "Bắt đầu thiết lập" và chưa bật.
    const enroll = !state.enabled && setup
      ? await startEnroll(deps.db, deps.config, {
          id: user.id,
          email: user.email,
        })
      : null;
    return reply.view("backoffice/security.njk", {
      pageTitle: "Bảo mật",
      backofficeSection: "security",
      twoFactor: state,
      enroll,
      backupRemaining: await countBackupCodes(deps.db, request.currentUser!.id),
    });
  });

  app.post("/security/2fa/enable", async (request, reply) => {
    try {
      const input = parseInput(tokenSchema, request.body);
      const codes = await confirmEnroll(
        deps.db,
        deps.config,
        request.currentUser!.id,
        input.token,
      );
      await writeAuditLog(deps.db, deps.config, request, {
        action: "ADMIN_2FA_ENABLED",
        targetType: "USER",
        targetId: request.currentUser!.id,
      });
      // Hiển thị mã dự phòng NGAY (một lần duy nhất) — không redirect.
      return reply.view("backoffice/security.njk", {
        pageTitle: "Bảo mật",
        backofficeSection: "security",
        twoFactor: await get2faState(deps.db, request.currentUser!.id),
        enroll: null,
        backupCodes: codes,
        backupRemaining: codes.length,
      });
    } catch (error) {
      flashAdminError(reply, deps.config, error);
      return reply.redirect("/backoffice/security");
    }
  });

  // Tạo lại mã dự phòng (huỷ mã cũ). Cần một mã TOTP hợp lệ.
  app.post("/security/2fa/backup-codes", async (request, reply) => {
    try {
      const input = parseInput(tokenSchema, request.body);
      const ok = await verifyUserTotp(
        deps.db,
        deps.config,
        request.currentUser!.id,
        input.token,
      );
      if (!ok) {
        setFlash(reply, deps.config, "error", "Mã xác thực không đúng.");
        return reply.redirect("/backoffice/security");
      }
      const codes = await regenerateBackupCodes(deps.db, request.currentUser!.id);
      await writeAuditLog(deps.db, deps.config, request, {
        action: "ADMIN_2FA_BACKUP_REGENERATED",
        targetType: "USER",
        targetId: request.currentUser!.id,
      });
      return reply.view("backoffice/security.njk", {
        pageTitle: "Bảo mật",
        backofficeSection: "security",
        twoFactor: await get2faState(deps.db, request.currentUser!.id),
        enroll: null,
        backupCodes: codes,
        backupRemaining: codes.length,
      });
    } catch (error) {
      flashAdminError(reply, deps.config, error);
      return reply.redirect("/backoffice/security");
    }
  });

  app.post("/security/2fa/disable", async (request, reply) => {
    try {
      const input = parseInput(tokenSchema, request.body);
      const ok = await verifyUserTotp(
        deps.db,
        deps.config,
        request.currentUser!.id,
        input.token,
      );
      if (!ok) {
        setFlash(
          reply,
          deps.config,
          "error",
          "Mã xác thực không đúng — cần mã hợp lệ để tắt 2FA.",
        );
        return reply.redirect("/backoffice/security");
      }
      await disable2fa(deps.db, request.currentUser!.id);
      await writeAuditLog(deps.db, deps.config, request, {
        action: "ADMIN_2FA_DISABLED",
        targetType: "USER",
        targetId: request.currentUser!.id,
      });
      setFlash(reply, deps.config, "success", "Đã tắt xác thực hai lớp.");
    } catch (error) {
      flashAdminError(reply, deps.config, error);
    }
    return reply.redirect("/backoffice/security");
  });
}
