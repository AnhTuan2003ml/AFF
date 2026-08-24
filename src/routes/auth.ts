import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  createSession,
  revokeCurrentSession,
} from "../auth/session.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { maskEmail, randomToken } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { setFlash, setWelcome } from "../lib/flash.js";
import { passwordSchema } from "../lib/password.js";
import { parseInput } from "../lib/validation.js";
import {
  authenticateWithEmail,
  registerWithEmail,
  requestPasswordReset,
  resetPassword,
  verifyRegistration,
} from "../services/auth.js";
import type { EmailService } from "../services/email.js";
import {
  buildGoogleAuthUrl,
  fetchGoogleProfile,
  findOrCreateGoogleUser,
  googleOAuthEnabled,
} from "../services/google-auth.js";
import { issueOtp } from "../services/otp.js";
import { issueMobileTokens } from "../services/mobile-token.js";
import { safeNextPath } from "../auth/guards.js";

interface AuthRouteDeps {
  db: Database;
  config: AppConfig;
  emailService: EmailService;
}

const emailSchema = z.string().trim().email("Email chưa đúng định dạng.").max(254);
const nameSchema = z
  .string()
  .trim()
  .min(2, "Họ tên cần ít nhất 2 ký tự.")
  .max(100, "Họ tên quá dài.");

const registerSchema = z
  .object({
    fullName: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    referralCode: z.string().trim().max(30).optional().default(""),
    acceptPolicies: z.literal("on", {
      error: "Bạn cần đồng ý Điều khoản và Chính sách quyền riêng tư.",
    }),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: "Mật khẩu nhập lại chưa khớp.",
    path: ["passwordConfirm"],
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Hãy nhập mật khẩu.").max(128),
  next: z.string().optional().default(""),
  remember: z.string().optional(),
});

const PENDING_EMAIL_COOKIE = "aff_pending_email";
const RESET_EMAIL_COOKIE = "aff_reset_email";
const OAUTH_STATE_COOKIE = "aff_oauth_state";
const OAUTH_NEXT_COOKIE = "aff_oauth_next";
// App di động đăng nhập Google bằng cách mở luồng web này trong trình duyệt rồi
// nhận token qua deep-link. Lưu deep-link đích (đã kiểm scheme) để callback biết
// phải trả token về app thay vì đặt cookie web.
const OAUTH_MOBILE_REDIRECT_COOKIE = "aff_oauth_mredir";

/**
 * Chỉ cho phép deep-link về đúng app (scheme của Expo Go và của bản build), tránh
 * bị lừa chuyển token sang địa chỉ lạ.
 */
function safeMobileRedirect(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^(exp|shoptik|vn\.shoptik\.app):\/\//.test(value)) return null;
  if (value.length > 512) return null;
  return value;
}

/*
 * Luồng Google của APP không được phụ thuộc cookie: trên iOS, trình duyệt xác
 * thực (ASWebAuthenticationSession + "Prevent Cross-Site Tracking" của Safari)
 * hay chặn cookie trong chuỗi redirect → callback không thấy cookie
 * `aff_oauth_mredir` và rơi nhầm về nhánh web thay vì deep-link về app.
 * Giải pháp: nhét redirect của app vào chính tham số `state` gửi qua Google —
 * ký HMAC bằng APP_SECRET, hạn 15 phút. Cookie vẫn được set song song (Android
 * dùng tốt); callback ưu tiên cookie, thiếu thì mở state ra.
 */
const MOBILE_STATE_PREFIX = "m1";
const MOBILE_STATE_TTL_MS = 15 * 60 * 1000;

function signMobileState(config: AppConfig, payload: string): string {
  return createHmac("sha256", config.APP_SECRET)
    .update(`${MOBILE_STATE_PREFIX}.${payload}`)
    .digest("base64url");
}

function packMobileState(config: AppConfig, redirect: string): string {
  const payload = Buffer.from(
    JSON.stringify({ n: randomToken(12), m: redirect, e: Date.now() + MOBILE_STATE_TTL_MS }),
  ).toString("base64url");
  return `${MOBILE_STATE_PREFIX}.${payload}.${signMobileState(config, payload)}`;
}

/** Trả về redirect của app nếu `state` là state mobile hợp lệ (chữ ký + hạn). */
function unpackMobileState(config: AppConfig, state: unknown): string | null {
  if (typeof state !== "string") return null;
  const [prefix, payload, sig] = state.split(".");
  if (prefix !== MOBILE_STATE_PREFIX || !payload || !sig) return null;
  const expected = signMobileState(config, payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      m?: unknown;
      e?: unknown;
    };
    if (typeof data.e !== "number" || data.e < Date.now()) return null;
    return safeMobileRedirect(data.m);
  } catch {
    return null;
  }
}

function signedEmailCookie(
  reply: FastifyReply,
  config: AppConfig,
  name: string,
  email: string,
): void {
  reply.setCookie(name, email, {
    path: "/",
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax",
    signed: true,
    maxAge: 20 * 60,
  });
}

function readSignedCookie(request: FastifyRequest, name: string): string | null {
  const signed = request.cookies[name];
  if (!signed) return null;
  const parsed = request.unsignCookie(signed);
  return parsed.valid && parsed.value ? parsed.value : null;
}

function renderAuthError(
  reply: FastifyReply,
  template: string,
  error: unknown,
  context: Record<string, unknown>,
) {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("INTERNAL_ERROR", "Hệ thống đang bận. Vui lòng thử lại.", 500);
  return reply.code(appError.statusCode).view(template, {
    ...context,
    formError: appError.message,
  });
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRouteDeps,
): Promise<void> {
  app.get("/dang-ky", async (request, reply) => {
    if (request.currentUser) return reply.redirect("/app");
    return reply.view("auth/register.njk", {
      pageTitle: "Tạo tài khoản",
      googleEnabled: googleOAuthEnabled(deps.config),
      referralCode: String(
        (request.query as Record<string, unknown>).ref ?? "",
      ).slice(0, 30),
    });
  });

  app.post(
    "/dang-ky",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      try {
        const input = parseInput(registerSchema, request.body);
        await registerWithEmail(
          deps.db,
          deps.emailService,
          deps.config,
          input,
        );
        signedEmailCookie(
          reply,
          deps.config,
          PENDING_EMAIL_COOKIE,
          input.email,
        );
        return reply.redirect("/xac-thuc-email");
      } catch (error) {
        const body = (request.body ?? {}) as Record<string, unknown>;
        return renderAuthError(reply, "auth/register.njk", error, {
          pageTitle: "Tạo tài khoản",
          googleEnabled: googleOAuthEnabled(deps.config),
          values: {
            fullName: String(body.fullName ?? ""),
            email: String(body.email ?? ""),
            referralCode: String(body.referralCode ?? ""),
          },
        });
      }
    },
  );

  app.get("/xac-thuc-email", async (request, reply) => {
    const email = readSignedCookie(request, PENDING_EMAIL_COOKIE);
    if (!email) return reply.redirect("/dang-ky");
    return reply.view("auth/verify-email.njk", {
      pageTitle: "Xác nhận email",
      maskedEmail: maskEmail(email),
    });
  });

  app.post(
    "/xac-thuc-email",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const email = readSignedCookie(request, PENDING_EMAIL_COOKIE);
      if (!email) return reply.redirect("/dang-ky");
      try {
        const input = parseInput(
          z.object({
            code: z.string().trim().regex(/^\d{6}$/, "Mã xác nhận gồm 6 chữ số."),
          }),
          request.body,
        );
        const userId = await verifyRegistration(
          deps.db,
          deps.config,
          request,
          email,
          input.code,
        );
        await createSession(deps.db, deps.config, request, reply, userId);
        reply.clearCookie(PENDING_EMAIL_COOKIE, { path: "/" });
        setFlash(
          reply,
          deps.config,
          "success",
          "Email đã được xác nhận. Bạn có thể bắt đầu tạo link hoàn tiền.",
        );
        return reply.redirect("/app");
      } catch (error) {
        return renderAuthError(reply, "auth/verify-email.njk", error, {
          pageTitle: "Xác nhận email",
          maskedEmail: maskEmail(email),
        });
      }
    },
  );

  app.post(
    "/xac-thuc-email/gui-lai",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const email = readSignedCookie(request, PENDING_EMAIL_COOKIE);
      if (!email) return reply.redirect("/dang-ky");
      try {
        await issueOtp(
          deps.db,
          deps.emailService,
          deps.config,
          email,
          "REGISTER",
        );
        setFlash(
          reply,
          deps.config,
          "success",
          "Mã xác nhận mới đã được gửi.",
        );
      } catch (error) {
        const message =
          error instanceof AppError
            ? error.message
            : "Chưa gửi được mã xác nhận.";
        setFlash(reply, deps.config, "error", message);
      }
      return reply.redirect("/xac-thuc-email");
    },
  );

  app.get("/dang-nhap", async (request, reply) => {
    if (request.currentUser) return reply.redirect("/app");
    const query = request.query as Record<string, unknown>;
    return reply.view("auth/login.njk", {
      pageTitle: "Đăng nhập",
      googleEnabled: googleOAuthEnabled(deps.config),
      next: safeNextPath(query.next, ""),
    });
  });

  app.post(
    "/dang-nhap",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      try {
        const input = parseInput(loginSchema, request.body);
        const user = await authenticateWithEmail(
          deps.db,
          input.email,
          input.password,
        );
        await createSession(deps.db, deps.config, request, reply, user.id, {
          remember: Boolean(input.remember),
        });
        setWelcome(reply, deps.config);
        return reply.redirect(safeNextPath(input.next, "/app"));
      } catch (error) {
        const body = (request.body ?? {}) as Record<string, unknown>;
        return renderAuthError(reply, "auth/login.njk", error, {
          pageTitle: "Đăng nhập",
          googleEnabled: googleOAuthEnabled(deps.config),
          next: safeNextPath(body.next, ""),
          values: { email: String(body.email ?? "") },
        });
      }
    },
  );

  app.post("/dang-xuat", async (request, reply) => {
    await revokeCurrentSession(deps.db, deps.config, request, reply);
    return reply.redirect("/");
  });

  app.get("/quen-mat-khau", async (_request, reply) =>
    reply.view("auth/forgot-password.njk", {
      pageTitle: "Quên mật khẩu",
    }),
  );

  app.post(
    "/quen-mat-khau",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      try {
        const input = parseInput(z.object({ email: emailSchema }), request.body);
        await requestPasswordReset(
          deps.db,
          deps.emailService,
          deps.config,
          input.email,
        );
        signedEmailCookie(
          reply,
          deps.config,
          RESET_EMAIL_COOKIE,
          input.email,
        );
        setFlash(
          reply,
          deps.config,
          "info",
          "Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi.",
        );
        return reply.redirect("/dat-lai-mat-khau");
      } catch (error) {
        return renderAuthError(reply, "auth/forgot-password.njk", error, {
          pageTitle: "Quên mật khẩu",
        });
      }
    },
  );

  app.get("/dat-lai-mat-khau", async (request, reply) => {
    const email = readSignedCookie(request, RESET_EMAIL_COOKIE);
    if (!email) return reply.redirect("/quen-mat-khau");
    return reply.view("auth/reset-password.njk", {
      pageTitle: "Đặt lại mật khẩu",
      maskedEmail: maskEmail(email),
    });
  });

  app.post(
    "/dat-lai-mat-khau",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const email = readSignedCookie(request, RESET_EMAIL_COOKIE);
      if (!email) return reply.redirect("/quen-mat-khau");
      try {
        const schema = z
          .object({
            code: z.string().trim().regex(/^\d{6}$/, "Mã xác nhận gồm 6 chữ số."),
            password: passwordSchema,
            passwordConfirm: z.string(),
          })
          .refine((value) => value.password === value.passwordConfirm, {
            message: "Mật khẩu nhập lại chưa khớp.",
            path: ["passwordConfirm"],
          });
        const input = parseInput(schema, request.body);
        await resetPassword(deps.db, deps.config, {
          email,
          code: input.code,
          password: input.password,
        });
        reply.clearCookie(RESET_EMAIL_COOKIE, { path: "/" });
        setFlash(
          reply,
          deps.config,
          "success",
          "Mật khẩu đã được đổi. Hãy đăng nhập lại.",
        );
        return reply.redirect("/dang-nhap");
      } catch (error) {
        return renderAuthError(reply, "auth/reset-password.njk", error, {
          pageTitle: "Đặt lại mật khẩu",
          maskedEmail: maskEmail(email),
        });
      }
    },
  );

  // ── Đăng nhập / đăng ký bằng Google (OAuth 2.0) ──────────────────────
  app.get(
    "/auth/google",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      if (request.currentUser) return reply.redirect("/app");
      if (!googleOAuthEnabled(deps.config)) {
        setFlash(
          reply,
          deps.config,
          "error",
          "Đăng nhập bằng Google chưa được bật.",
        );
        return reply.redirect("/dang-nhap");
      }
      // `state` chống CSRF của chính luồng OAuth: lưu bản signed ở cookie rồi
      // đối chiếu lại ở callback.
      const q = request.query as Record<string, unknown>;
      // App: state tự chứa redirect (ký HMAC) — callback không cần cookie.
      const mobileStateRedirect =
        q.flow === "mobile" ? safeMobileRedirect(q.redirect_uri) : null;
      const state = mobileStateRedirect
        ? packMobileState(deps.config, mobileStateRedirect)
        : randomToken(24);
      signedEmailCookie(reply, deps.config, OAUTH_STATE_COOKIE, state);
      const next = safeNextPath(q.next, "");
      if (next) {
        signedEmailCookie(reply, deps.config, OAUTH_NEXT_COOKIE, next);
      }
      // Luồng app di động: mở trong trình duyệt, kết thúc trả token về deep-link.
      if (q.flow === "mobile") {
        const redirect = safeMobileRedirect(q.redirect_uri);
        if (!redirect) {
          setFlash(reply, deps.config, "error", "Liên kết đăng nhập không hợp lệ.");
          return reply.redirect("/dang-nhap");
        }
        signedEmailCookie(
          reply,
          deps.config,
          OAUTH_MOBILE_REDIRECT_COOKIE,
          redirect,
        );
      }
      return reply.redirect(buildGoogleAuthUrl(deps.config, state));
    },
  );

  app.get(
    "/auth/google/callback",
    { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const stateCookie = readSignedCookie(request, OAUTH_STATE_COOKIE);
      const nextCookie = readSignedCookie(request, OAUTH_NEXT_COOKIE);
      const queryState = String((request.query as Record<string, unknown>).state ?? "");
      // Ưu tiên cookie (Android); iOS mất cookie thì lấy từ state đã ký.
      const mobileRedirect =
        safeMobileRedirect(readSignedCookie(request, OAUTH_MOBILE_REDIRECT_COOKIE)) ??
        unpackMobileState(deps.config, queryState);
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
      reply.clearCookie(OAUTH_NEXT_COOKIE, { path: "/" });
      reply.clearCookie(OAUTH_MOBILE_REDIRECT_COOKIE, { path: "/" });

      // App di động: kết thúc bằng deep-link, KHÔNG dùng flash/cookie web.
      // Token đặt ở fragment (#...) để không lọt vào log máy chủ.
      const failMobile = (message: string) =>
        reply.redirect(
          `${mobileRedirect}#${new URLSearchParams({ error: message }).toString()}`,
        );

      if (query.error) {
        if (mobileRedirect) return failMobile("Bạn đã hủy đăng nhập bằng Google.");
        setFlash(reply, deps.config, "error", "Bạn đã hủy đăng nhập bằng Google.");
        return reply.redirect("/dang-nhap");
      }

      const code = String(query.code ?? "");
      const state = String(query.state ?? "");
      // Chống CSRF: bình thường đối chiếu cookie; riêng state mobile đã ký HMAC
      // + có hạn thì tự nó là bằng chứng (iOS có thể không mang được cookie).
      const stateValid = stateCookie
        ? state === stateCookie
        : unpackMobileState(deps.config, state) !== null;
      if (!code || !state || !stateValid) {
        const msg = "Phiên đăng nhập Google đã hết hạn. Hãy thử lại.";
        if (mobileRedirect) return failMobile(msg);
        setFlash(reply, deps.config, "error", msg);
        return reply.redirect("/dang-nhap");
      }

      try {
        const profile = await fetchGoogleProfile(deps.config, code);
        const { userId } = await findOrCreateGoogleUser(
          deps.db,
          deps.emailService,
          deps.config,
          request,
          profile,
        );
        if (mobileRedirect) {
          const tokens = await issueMobileTokens(
            deps.db,
            deps.config,
            request,
            userId,
          );
          const frag = new URLSearchParams({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: String(tokens.expiresIn),
            refreshExpiresAt: new Date(tokens.refreshExpiresAt).toISOString(),
          }).toString();
          return reply.redirect(`${mobileRedirect}#${frag}`);
        }
        await createSession(deps.db, deps.config, request, reply, userId);
        setWelcome(reply, deps.config);
        return reply.redirect(safeNextPath(nextCookie, "/app"));
      } catch (error) {
        const message =
          error instanceof AppError
            ? error.message
            : "Đăng nhập Google thất bại. Hãy thử lại.";
        if (mobileRedirect) return failMobile(message);
        setFlash(reply, deps.config, "error", message);
        return reply.redirect("/dang-nhap");
      }
    },
  );
}
