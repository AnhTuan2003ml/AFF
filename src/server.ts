import path from "node:path";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import view from "@fastify/view";
import Fastify from "fastify";
import nunjucks from "nunjucks";
import { registerCsrfProtection } from "./auth/csrf.js";
import { readBearerToken, registerSessionHooks } from "./auth/session.js";
import { sha256 } from "./lib/crypto.js";
import { bootstrapDefaultAdmins, syncAdminAccountsFromEnv } from "./auth/admin-sync.js";
import { loadConfig } from "./config.js";
import { assertDatabaseReady, createDatabase, query } from "./db.js";
import { AppError, asAppError, respondWithAppError } from "./lib/errors.js";
import { consumeFlash, consumeWelcome } from "./lib/flash.js";
import {
  auditActionTone,
  formatAuditAction,
  formatAuditTargetType,
  formatAuditTone,
  formatDate,
  formatDateTime,
  formatVnd,
} from "./lib/format.js";
import { startSyncScheduler } from "./jobs/sync-scheduler.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { getValidLazadaAccessToken } from "./services/lazada-oauth.js";
import { setLazadaAccessTokenProvider } from "./services/lazada-open-api.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerAppRoutes } from "./routes/app.js";
import { registerBackofficeRoutes } from "./routes/backoffice.js";
import { registerAdminConsoleRoutes } from "./routes/admin-console.js";
import { registerApiRoutes } from "./routes/api/index.js";
import { registerSlackEventRoutes } from "./routes/slack-events.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { EmailService } from "./services/email.js";
import {
  ensureMissionDefinitionsSeeded,
  getUnreadNotificationCount,
  WEB_BELL_EXCLUDED_TYPES,
  listNotifications,
} from "./services/mission.js";
import { getWalletBalances } from "./services/ledger.js";
import { hasVerifiedBank } from "./services/app-dashboard.js";
import { countUnreadSupportReplies } from "./services/support-chat.js";

const projectRoot = process.cwd();
// Đổi mỗi lần khởi động để né cache immutable 30 ngày của /assets/*.
const assetVersion = Date.now().toString(36);
const config = loadConfig();
const db = createDatabase(config);
const emailService = new EmailService(config);
const loggerOptions = {
  level: config.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "body.password",
      "body.passwordConfirm",
      "body.code",
      "body.accountNumber",
    ],
    censor: "[REDACTED]",
  },
  ...(config.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
};

const app = Fastify({
  trustProxy: config.TRUST_PROXY,
  requestIdHeader: "x-request-id",
  logger: loggerOptions,
});

app.server.keepAliveTimeout = 65_000;
app.server.headersTimeout = 66_000;

await app.register(cookie, {
  secret: config.APP_SECRET,
  hook: "onRequest",
});
await app.register(formbody, { bodyLimit: 64 * 1024 });
await app.register(multipart, {
  attachFieldsToBody: "keyValues",
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
});
await app.register(helmet, {
  global: true,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests:
        config.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  strictTransportSecurity:
    config.NODE_ENV === "production"
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
});
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: "1 minute",
  /*
   * allowList dạng MẢNG được so với "key" của bộ đếm (mặc định là IP), không
   * phải đường dẫn — nên khai báo cũ ["/-/live", "/-/ready"] không bao giờ
   * khớp và chính health check cũng bị tính hạn mức. Dùng hàm để lọc theo URL.
   *
   * Quan trọng hơn: KHÔNG tính hạn mức cho tệp tĩnh. Một lần mở trang /app
   * kéo hơn 25 tệp CSS/JS/ảnh, nên chỉ vài lần chuyển trang là chạm mốc 300 —
   * người dùng thật lãnh 429, và băng chuyền "Đang hot trên Shopee" biến mất
   * vì fetch /app/promo-products bị chặn (JS coi phản hồi lỗi là kho trống).
   * Tệp tĩnh đọc thẳng từ đĩa, không chạm DB, nên không cần bảo vệ ở đây.
   */
  allowList: (request) =>
    request.url.startsWith("/assets/") ||
    request.url === "/-/live" ||
    request.url === "/-/ready",
  /*
   * Khóa bộ đếm: token thiết bị nếu là app, còn lại vẫn là IP.
   *
   * Mặc định của plugin đếm theo IP. Với web thì tạm ổn, nhưng người dùng app
   * đi qua NAT của nhà mạng — hàng nghìn thuê bao 4G dùng chung một IP công
   * cộng, nghĩa là cả nhóm chia nhau đúng một hạn mức 300/phút rồi lãnh 429
   * tập thể. Web còn đỡ vì tệp tĩnh đã được allowList bỏ qua, còn app thì MỌI
   * request đều là API có tính hạn mức.
   *
   * Chưa đăng nhập (đăng nhập, quên mật khẩu…) thì vẫn đếm theo IP — đó đúng
   * là chỗ cần chặn thử sai hàng loạt. Băm token để không ghi bí mật vào khóa
   * bộ đếm nằm trong bộ nhớ.
   */
  keyGenerator: (request) => {
    const bearer = readBearerToken(request);
    return bearer ? `tok:${sha256(bearer)}` : request.ip;
  },
  errorResponseBuilder: (_request, context) =>
    new AppError(
      "RATE_LIMITED",
      `Bạn thao tác quá nhanh. Hãy thử lại sau ${Math.ceil(context.ttl / 1000)} giây.`,
      context.statusCode,
    ),
});
await app.register(fastifyStatic, {
  root: path.join(projectRoot, "public"),
  prefix: "/assets/",
  immutable: config.NODE_ENV === "production",
  maxAge: config.NODE_ENV === "production" ? "30d" : 0,
});
await app.register(view, {
  engine: { nunjucks },
  root: path.join(projectRoot, "views"),
  viewExt: "njk",
  options: {
    /*
     * Ngoài production thì KHÔNG cache template đã biên dịch.
     *
     * Nunjucks đọc và biên dịch file .njk ở lần render đầu rồi giữ luôn trong
     * bộ nhớ, trong khi `tsx watch` chỉ theo dõi src/ nên sửa .njk không làm
     * server khởi động lại. Hệ quả rất khó đoán khi phát triển: CSS trong
     * public/ được đọc lại từ đĩa mỗi request nên LUÔN mới, còn giao diện thì
     * vẫn là bản cũ — nửa mới nửa cũ, ví dụ thẻ <nav> đã xoá vẫn hiện ra
     * nhưng mất sạch kiểu dáng vì CSS tương ứng đã bị gỡ.
     *
     * Production vẫn cache để không phải đọc đĩa mỗi lượt render.
     */
    noCache: config.NODE_ENV !== "production",
    onConfigure(environment: nunjucks.Environment) {
      environment.addFilter("vnd", formatVnd);
      environment.addFilter("datetime", formatDateTime);
      environment.addFilter("date", formatDate);
      environment.addFilter("auditAction", formatAuditAction);
      environment.addFilter("auditTone", auditActionTone);
      environment.addFilter("auditToneLabel", formatAuditTone);
      environment.addFilter("auditTargetType", formatAuditTargetType);
    },
  },
});

await registerSessionHooks(app, db, config);
await registerCsrfProtection(app, config);

app.addHook("onRequest", async (request, reply) => {
  const pathOnly = request.url.split("?")[0]?.replace(/\/+$/, "");
  if (pathOnly === "/backoffice") {
    return reply.redirect("/backoffice/console");
  }
});

app.addHook("preHandler", async (request, reply) => {
  const target = reply as typeof reply & { locals?: Record<string, unknown> };
  target.locals ??= {};
  let backofficeOrdersPendingCount = 0;
  let backofficeWithdrawalsPendingCount = 0;
  let backofficeMissionsPendingCount = 0;
  let backofficeReferralCodesPendingCount = 0;
  let backofficeBanksPendingCount = 0;
  if (
    request.currentUser &&
    request.url.startsWith("/backoffice") &&
    ["SUPER_ADMIN", "ADMIN", "FINANCE", "RISK", "SUPPORT", "AUDITOR"].includes(
      request.currentUser.role,
    )
  ) {
    const backofficeCounts = await query<{
      orders_pending_count: string;
      withdrawals_pending_count: string;
      missions_pending_count: string;
      referral_codes_pending_count: string;
      banks_pending_count: string;
    }>(
      db,
      `
        SELECT
          (SELECT count(*) FROM orders WHERE status = 'PENDING')::text
            AS orders_pending_count,
          (SELECT count(*) FROM withdrawals
            WHERE status IN ('FUNDS_HELD', 'UNKNOWN'))::text
            AS withdrawals_pending_count,
          (SELECT count(*) FROM user_mission_claims WHERE status = 'PENDING')::text
            AS missions_pending_count,
          (SELECT count(*) FROM referral_code_requests WHERE status = 'PENDING')::text
            AS referral_codes_pending_count,
          (SELECT count(*) FROM user_bank_accounts WHERE status = 'PENDING_REVIEW')::text
            AS banks_pending_count
      `,
    );
    backofficeOrdersPendingCount = Number(
      backofficeCounts.rows[0]?.orders_pending_count ?? 0,
    );
    backofficeWithdrawalsPendingCount = Number(
      backofficeCounts.rows[0]?.withdrawals_pending_count ?? 0,
    );
    backofficeMissionsPendingCount = Number(
      backofficeCounts.rows[0]?.missions_pending_count ?? 0,
    );
    backofficeReferralCodesPendingCount = Number(
      backofficeCounts.rows[0]?.referral_codes_pending_count ?? 0,
    );
    backofficeBanksPendingCount = Number(
      backofficeCounts.rows[0]?.banks_pending_count ?? 0,
    );
  }
  let unreadNotificationCount = 0;
  let recentNotifications: Awaited<ReturnType<typeof listNotifications>> = [];
  let headerBalances: Awaited<ReturnType<typeof getWalletBalances>> | null =
    null;
  let unreadSupportCount = 0;
  // Mặc định coi như đã có ngân hàng để KHÔNG nhắc nhầm trên các request không
  // truy vấn (POST); chỉ GET mới kiểm tra thật để hiện nhắc trong chuông.
  let headerHasVerifiedBank = true;
  if (request.currentUser && request.url.startsWith("/app")) {
    [
      unreadNotificationCount,
      recentNotifications,
      headerBalances,
      unreadSupportCount,
      headerHasVerifiedBank,
    ] = await Promise.all([
      getUnreadNotificationCount(db, request.currentUser.id, {
        excludeTypes: WEB_BELL_EXCLUDED_TYPES,
      }),
      listNotifications(db, request.currentUser.id, 8),
      request.method === "GET"
        ? getWalletBalances(db, request.currentUser.id)
        : Promise.resolve(null),
      request.method === "GET"
        ? countUnreadSupportReplies(db, request.currentUser.id)
        : Promise.resolve(0),
      request.method === "GET"
        ? hasVerifiedBank(db, request.currentUser.id)
        : Promise.resolve(true),
    ]);
  }

  Object.assign(target.locals, {
    appName: config.APP_NAME,
    assetVersion,
    backofficeOrdersPendingCount,
    backofficeWithdrawalsPendingCount,
    backofficeMissionsPendingCount,
    backofficeReferralCodesPendingCount,
    backofficeBanksPendingCount,
    communityZaloUrl: config.COMMUNITY_ZALO_URL,
    communityTelegramUrl: config.COMMUNITY_TELEGRAM_URL,
    currentUser: request.currentUser,
    currentPath: request.url.split("?")[0],
    flash: consumeFlash(request, reply),
    welcomeBack: consumeWelcome(request, reply),
    headerBalances,
    minimumWithdrawal: config.MIN_WITHDRAWAL_VND,
    unreadNotificationCount,
    recentNotifications,
    unreadSupportCount,
    headerHasVerifiedBank,
  });
});

await registerPublicRoutes(app, { db, config });
await registerAuthRoutes(app, { db, config, emailService });

  // Lazada Open API ưu tiên token OAuth trong DB (tự refresh khi sắp hết hạn);
  // thiếu/hỏng thì lazada-open-api tự rơi về ENV token cũ.
  setLazadaAccessTokenProvider((cfg) => getValidLazadaAccessToken(db, cfg));
await app.register(
  async (scoped) =>
    registerAppRoutes(scoped, { db, config, emailService }),
  { prefix: "/app" },
);
await app.register(
  async (scoped) => registerBackofficeRoutes(scoped, { db, config }),
  { prefix: "/backoffice" },
);
await app.register(
  async (scoped) =>
    registerAdminConsoleRoutes(scoped, { db, config, emailService }),
  { prefix: "/backoffice" },
);
await app.register(
  async (scoped) => registerApiRoutes(scoped, { db, config, emailService }),
  { prefix: "/api/v1" },
);
await registerSlackEventRoutes(app, { db, config, emailService });
  await registerWebhookRoutes(app, { config });

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) {
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "API không tồn tại.",
        requestId: request.id,
      },
    });
  }
  return reply.code(404).view("error.njk", {
    pageTitle: "Không tìm thấy trang",
    statusCode: 404,
    message: "Trang bạn cần không tồn tại hoặc đã được chuyển đi.",
  });
});

app.setErrorHandler(async (error, request, reply) => {
  const appError = asAppError(error);
  if (appError.statusCode >= 500) {
    request.log.error({ err: error }, "Lỗi xử lý yêu cầu");
  }
  return respondWithAppError(request, reply, appError);
});

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, "Đang dừng máy chủ");
  await app.close();
  await db.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Khai báo ngoài try để nhánh catch còn tắt được bộ hẹn giờ đồng bộ.
let scheduler: { stop: () => void } | null = null;

/* Hook phải đăng ký TRƯỚC app.listen() — Fastify ném
   FST_ERR_INSTANCE_ALREADY_LISTENING nếu addHook sau khi đã lắng nghe. Hook
   đóng bao quanh biến `scheduler` nên vẫn thấy giá trị gán về sau. */
app.addHook("onClose", async () => scheduler?.stop());

try {
  await assertDatabaseReady(db);
  const defaultAdmins = await bootstrapDefaultAdmins(db);
  if (defaultAdmins.created.length || defaultAdmins.updated.length) {
    app.log.info(
      {
        created: defaultAdmins.created.length,
        updated: defaultAdmins.updated.length,
      },
      "Đã đảm bảo admin mặc định (hardcode)",
    );
  }
  await ensureMissionDefinitionsSeeded(db, config);
  const adminSync = await syncAdminAccountsFromEnv(db, config);
  if (
    adminSync.created.length ||
    adminSync.updated.length ||
    adminSync.revoked.length
  ) {
    app.log.info(
      {
        created: adminSync.created.length,
        updated: adminSync.updated.length,
        revoked: adminSync.revoked.length,
        skippedRevokeLastAdmin: adminSync.skippedRevokeLastAdmin,
      },
      "Đã đồng bộ tài khoản admin từ ENV",
    );
  }
  await app.listen({ host: config.HOST, port: config.PORT });

  /*
   * Bật đồng bộ nền SAU khi đã lắng nghe được cổng.
   *
   * startSyncScheduler chạy ngay một lượt (`void tick()`) chứ không đợi hết
   * chu kỳ đầu. Đặt nó TRƯỚC app.listen() thì khi listen ném lỗi — hay gặp
   * nhất là EADDRINUSE vì dev server cũ chưa tắt — nhánh catch đóng pool
   * trong lúc lượt đồng bộ đó còn đang chạy dở, sinh ra lỗi thứ hai
   * "Cannot use a pool after calling end on the pool" che mất nguyên nhân
   * thật. clearInterval không cứu được vì nó chỉ chặn các lượt SAU.
   */
  if (config.ENABLE_SYNC_SCHEDULER) {
    scheduler = startSyncScheduler(db, config, app.log);
  }
} catch (error) {
  // Chỉ clearInterval, gọi lại vô hại. Với thứ tự mới thì bộ hẹn giờ hầu như
  // chưa kịp chạy, nhưng vẫn dọn cho chắc.
  scheduler?.stop();

  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EADDRINUSE") {
    app.log.fatal(
      `Cổng ${config.PORT} đang bị một tiến trình khác chiếm — nhiều khả năng là bản dev server cũ chưa tắt. Tắt tiến trình đó rồi chạy lại, hoặc đổi cổng bằng biến môi trường PORT.`,
    );
  } else {
    app.log.fatal({ err: error }, "Không thể khởi động máy chủ");
  }

  await app.close().catch(() => undefined);
  await db.end().catch(() => undefined);
  process.exit(1);
}
