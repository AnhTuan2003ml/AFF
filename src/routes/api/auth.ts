import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSession, revokeCurrentSession } from "../../auth/session.js";
import { passwordSchema } from "../../lib/password.js";
import { parseInput } from "../../lib/validation.js";
import {
  authenticateWithEmail,
  registerWithEmail,
  requestPasswordReset,
  resetPassword,
  verifyRegistration,
} from "../../services/auth.js";
import type { ApiDeps } from "./deps.js";

const email = z.string().trim().email().max(254);

export async function registerAuthApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
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
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
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
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
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
}
