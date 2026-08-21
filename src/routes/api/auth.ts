import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApiUser } from "../../auth/guards.js";
import {
  createSession,
  revokeCurrentSession,
} from "../../auth/session.js";
import { query } from "../../db.js";
import { AppError } from "../../lib/errors.js";
import { passwordSchema } from "../../lib/password.js";
import { parseInput } from "../../lib/validation.js";
import {
  authenticateWithEmail,
  registerWithEmail,
  requestPasswordReset,
  resetPassword,
  verifyRegistration,
} from "../../services/auth.js";
import {
  issueMobileTokens,
  revokeMobileSessionByAccessToken,
  rotateMobileTokens,
  type MobileTokenPair,
} from "../../services/mobile-token.js";
import {
  findOrCreateGoogleUser,
  verifyGoogleIdToken,
} from "../../services/google-auth.js";
import type { ApiDeps } from "./deps.js";

const email = z.string().trim().email().max(254);

/**
 * Vì sao nhánh /auth/token/* được miễn kiểm tra CSRF:
 *
 * CSRF chỉ có nghĩa khi quyền hạn nằm trong cookie mà trình duyệt TỰ đính
 * kèm. Các route dưới đây không đặt cookie nào — chúng trả token trong thân
 * phản hồi, và chỉ ai đọc được phản hồi mới dùng được. Một trang web độc hại
 * có thể ép trình duyệt nạn nhân GỬI yêu cầu, nhưng không đọc được kết quả,
 * nên không lấy được token. Đăng nhập bằng cookie (/auth/login) thì vẫn giữ
 * nguyên kiểm tra CSRF như cũ.
 */
const NO_CSRF = { csrf: false } as const;

function tokenResponse(
  tokens: MobileTokenPair,
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    avatarUrl: string;
  },
) {
  return {
    tokenType: tokens.tokenType,
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt,
    user,
  };
}

async function loadPublicUser(
  db: ApiDeps["db"],
  userId: string,
): Promise<{
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl: string;
}> {
  const result = await query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
    avatar_url: string;
  }>(
    db,
    "SELECT id, email, full_name, role, avatar_url FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError("USER_NOT_FOUND", "Không tìm thấy tài khoản.", 404);
  }
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    avatarUrl: row.avatar_url,
  };
}

export async function registerAuthApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  app.post(
    "/auth/register",
    { config: { ...NO_CSRF, rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const input = parseInput(
        z
          .object({
            fullName: z.string().trim().min(2).max(100),
            email,
            password: passwordSchema,
            passwordConfirm: z.string(),
            referralCode: z.string().trim().max(30).optional().default(""),
            acceptPolicies: z.literal(true),
          })
          .refine((value) => value.password === value.passwordConfirm, {
            message: "Mật khẩu nhập lại chưa khớp.",
            path: ["passwordConfirm"],
          }),
        request.body,
      );
      await registerWithEmail(deps.db, deps.emailService, deps.config, input);
      return reply.code(202).send({
        status: "OTP_REQUIRED",
        message: "Mã xác nhận đã được gửi tới email.",
      });
    },
  );

  app.post(
    "/auth/verify-email",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          email,
          code: z.string().regex(/^\d{6}$/),
        }),
        request.body,
      );
      const userId = await verifyRegistration(
        deps.db,
        deps.config,
        request,
        input.email,
        input.code,
      );
      await createSession(deps.db, deps.config, request, reply, userId);
      return reply.code(200).send({ status: "VERIFIED" });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({ email, password: z.string().min(1).max(128) }),
        request.body,
      );
      const user = await authenticateWithEmail(
        deps.db,
        input.email,
        input.password,
      );
      await createSession(deps.db, deps.config, request, reply, user.id);
      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      });
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    await revokeCurrentSession(deps.db, deps.config, request, reply);
    return reply.code(204).send();
  });

  app.post(
    "/auth/forgot-password",
    { config: { ...NO_CSRF, rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const input = parseInput(z.object({ email }), request.body);
      await requestPasswordReset(
        deps.db,
        deps.emailService,
        deps.config,
        input.email,
      );
      return reply.code(202).send({
        message: "Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi.",
      });
    },
  );

  app.post(
    "/auth/reset-password",
    { config: { ...NO_CSRF, rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({
          email,
          code: z.string().regex(/^\d{6}$/),
          password: passwordSchema,
        }),
        request.body,
      );
      await resetPassword(deps.db, deps.config, input);
      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------ *
   * Nhánh token — dành cho app di động.
   *
   * Không đặt cookie, không đọc cookie. Đăng nhập bằng cookie ở
   * /auth/login phía trên giữ nguyên cho web; hai cơ chế chạy song song.
   * ------------------------------------------------------------------ */

  app.post(
    "/auth/token",
    { config: { ...NO_CSRF, rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({ email, password: z.string().min(1).max(128) }),
        request.body,
      );
      const user = await authenticateWithEmail(
        deps.db,
        input.email,
        input.password,
      );
      const tokens = await issueMobileTokens(
        deps.db,
        deps.config,
        request,
        user.id,
      );
      return reply.send(
        tokenResponse(tokens, {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          avatarUrl: user.avatarUrl,
        }),
      );
    },
  );

  // Bước cuối của đăng ký trên app: nhập mã OTP xong là có token luôn,
  // không bắt người dùng đăng nhập lại một lần nữa.
  app.post(
    "/auth/token/verify-email",
    { config: { ...NO_CSRF, rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({ email, code: z.string().regex(/^\d{6}$/) }),
        request.body,
      );
      const userId = await verifyRegistration(
        deps.db,
        deps.config,
        request,
        input.email,
        input.code,
      );
      const tokens = await issueMobileTokens(
        deps.db,
        deps.config,
        request,
        userId,
      );
      const user = await loadPublicUser(deps.db, userId);
      return reply.send(tokenResponse(tokens, user));
    },
  );

  // Đăng nhập bằng Google trên app: app lấy id_token qua expo-auth-session rồi
  // gửi lên đây. Không cookie, không CSRF như các nhánh token khác.
  app.post(
    "/auth/token/google",
    { config: { ...NO_CSRF, rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({ idToken: z.string().trim().min(20).max(4096) }),
        request.body,
      );
      const profile = await verifyGoogleIdToken(deps.config, input.idToken);
      const { userId } = await findOrCreateGoogleUser(
        deps.db,
        deps.emailService,
        deps.config,
        request,
        profile,
      );
      const tokens = await issueMobileTokens(
        deps.db,
        deps.config,
        request,
        userId,
      );
      const user = await loadPublicUser(deps.db, userId);
      return reply.send(tokenResponse(tokens, user));
    },
  );

  app.post(
    "/auth/token/refresh",
    { config: { ...NO_CSRF, rateLimit: { max: 60, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const input = parseInput(
        z.object({ refreshToken: z.string().trim().min(20).max(200) }),
        request.body,
      );
      const tokens = await rotateMobileTokens(
        deps.db,
        deps.config,
        input.refreshToken,
      );
      // Trả kèm hồ sơ để app cập nhật tên/vai trò nếu vừa đổi ở nơi khác.
      const user = await loadPublicUser(deps.db, tokens.userId);
      return reply.send(tokenResponse(tokens, user));
    },
  );

  // Đăng xuất đúng thiết bị đang cầm token. Bearer đã được miễn CSRF ở
  // auth/csrf.ts nên không cần khai báo thêm.
  app.post(
    "/auth/token/revoke",
    { preHandler: requireApiUser },
    async (request, reply) => {
      if (request.sessionToken) {
        await revokeMobileSessionByAccessToken(deps.db, request.sessionToken);
      }
      return reply.code(204).send();
    },
  );
}
