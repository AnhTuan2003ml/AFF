import { z } from "zod";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile();
} catch {
  // Production thường truyền biến môi trường trực tiếp và không có file .env.
}

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

function booleanFromStringDefault(defaultValue: "true" | "false") {
  return z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((value) => value === "true");
}

const httpsUrlOrEmpty = z
  .string()
  .trim()
  .default("")
  .refine(
    (value) => !value || value.startsWith("https://"),
    "URL tích hợp sàn phải dùng HTTPS.",
  );

const commissionRateBps = z.coerce
  .number()
  .int()
  .min(0)
  .max(10000)
  .default(0);

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().min(1).max(80).default("ShopTik"),
  TRUST_PROXY: booleanFromString,
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: booleanFromString,
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(100).default(20),
  REDIS_URL: z.string().optional().default(""),
  APP_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(32),
  IP_HASH_PEPPER: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z.string().min(1),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  // Phiên app di động: access token ngắn hạn + refresh token dài hạn. Cookie
  // web vẫn dùng SESSION_TTL_HOURS ở trên, hai vòng đời không dính nhau.
  MOBILE_ACCESS_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(720)
    .default(30),
  MOBILE_REFRESH_TOKEN_TTL_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(60),
  OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(30).default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().min(1).max(20).default(5),
  EMAIL_MODE: z.enum(["console", "smtp"]).default("console"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromString,
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("ShopTik"),
  SMTP_FROM_EMAIL: z.string().email().default("no-reply@example.com"),
  // Email hỗ trợ hiển thị cho người dùng (footer email chào mừng…). Trống thì
  // dùng SMTP_FROM_EMAIL.
  SUPPORT_EMAIL: z.string().trim().default(""),
  // Nơi nhận email cảnh báo lỗi hệ thống nền (đồng bộ đối soát đơn thất bại,
  // cookie Shopee hết hạn, không điều khiển được trình duyệt lấy sản phẩm Khám
  // phá…). Nhiều địa chỉ ngăn cách bằng dấu phẩy. Trống = tự suy ra theo thứ tự
  // SUPPORT_EMAIL → SMTP_FROM_EMAIL.
  ADMIN_ALERT_EMAIL: z.string().trim().default(""),
  // Chống spam: mỗi LOẠI lỗi chỉ gửi lại email cảnh báo sau ngần này phút, kể cả
  // khi job lỗi liên tục mỗi nhịp scheduler.
  ADMIN_ALERT_COOLDOWN_MINUTES: z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .default(30),
  SHOPEE_AFFILIATE_ID: z.string().default(""),
  // Token cho profile-worker (Playwright chạy trên máy host) gọi API
  // /api/v1/harvest/*. Trống = tắt toàn bộ API worker.
  HARVEST_WORKER_TOKEN: z.string().trim().default(""),
  // Địa chỉ ứng dụng Browser Control để server ĐIỀU KHIỂN TRỰC TIẾP profile
  // (không cần worker). Server chạy trong Docker nên mặc định trỏ host qua
  // host.docker.internal; máy chạy trực tiếp thì đặt http://127.0.0.1:9222.
  BROWSER_CONTROL_URL: z
    .string()
    .trim()
    .default("http://host.docker.internal:9222"),
  // Lấy tại affiliate.shopee.vn → Công cụ → API.
  SHOPEE_OPEN_API_APP_ID: z.string().trim().default(""),
  SHOPEE_OPEN_API_SECRET: z.string().trim().default(""),
  SHOPEE_PRODUCT_API_URL: httpsUrlOrEmpty,
  SHOPEE_PRODUCT_API_TOKEN: z.string().default(""),
  SHOPEE_DEFAULT_COMMISSION_RATE_BPS: commissionRateBps,
  SHOPEE_AFFILIATE_REDIRECT_HOSTS: z.string().default(""),
  TIKTOK_AFFILIATE_ID: z.string().default(""),
  TIKTOK_PRODUCT_API_URL: httpsUrlOrEmpty,
  TIKTOK_PRODUCT_API_TOKEN: z.string().default(""),
  TIKTOK_DEFAULT_COMMISSION_RATE_BPS: commissionRateBps,
  TIKTOK_AFFILIATE_REDIRECT_HOSTS: z.string().default(""),
  // Access token TikTok chưa tự refresh — hết hạn phải dán lại.
  TIKTOK_OPEN_API_APP_KEY: z.string().trim().default(""),
  TIKTOK_OPEN_API_APP_SECRET: z.string().trim().default(""),
  TIKTOK_OPEN_API_ACCESS_TOKEN: z.string().trim().default(""),
  // Để trống nếu app được tạo link trực tiếp cho Open Collaboration.
  TIKTOK_AFFILIATE_CAMPAIGN_ID: z.string().trim().default(""),
  LAZADA_AFFILIATE_ID: z.string().default(""),
  // Master Link dạng https://c.lazada.vn/t/c.xxxxx; link s.lazada.vn không thay thế được.
  LAZADA_AFFILIATE_MASTER_LINK: z.string().trim().default(""),
  LAZADA_PRODUCT_API_URL: httpsUrlOrEmpty,
  LAZADA_PRODUCT_API_TOKEN: z.string().default(""),
  LAZADA_DEFAULT_COMMISSION_RATE_BPS: commissionRateBps,
  LAZADA_AFFILIATE_REDIRECT_HOSTS: z.string().default(""),
  // Access token Lazada chưa tự refresh — hết hạn phải dán lại.
  LAZADA_OPEN_API_APP_KEY: z.string().trim().default(""),
  LAZADA_OPEN_API_APP_SECRET: z.string().trim().default(""),
  LAZADA_OPEN_API_ACCESS_TOKEN: z.string().trim().default(""),
  // Lazada AFFILIATE Open Platform (adsense.lazada.vn → Mở API): dùng chung
  // App Key/Secret ở trên (LiteApp) nhưng xác thực bằng User Token truyền như
  // BUSINESS PARAM `userToken` (không phải access_token). Đây là nguồn hoa hồng
  // thật theo sản phẩm (/marketing/product/feed → totalCommissionAmount/Rate).
  LAZADA_AFFILIATE_USER_TOKEN: z.string().trim().default(""),
  // Callback OAuth Lazada Open Platform. Trống = tự suy ra
  // APP_ORIGIN + "/auth/lazada/callback" (production:
  // https://shoptikvn.com/auth/lazada/callback — khai đúng URL này trên Lazada).
  LAZADA_OAUTH_REDIRECT_URI: z.string().trim().default(""),
  SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(8000),
  // Đăng nhập/đăng ký bằng Google (OAuth 2.0). Lấy Client ID + Secret tại
  // Google Cloud Console → APIs & Services → Credentials. Thiếu một trong hai
  // là tắt tính năng, app vẫn chạy bình thường (chỉ ẩn nút "Tiếp tục với Google").
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().trim().default(""),
  // Trống = tự suy ra APP_ORIGIN + "/auth/google/callback". Phải trùng đúng
  // "Authorized redirect URIs" đã khai trong Google Cloud Console.
  GOOGLE_OAUTH_REDIRECT_URI: httpsUrlOrEmpty,
  // App di động đăng nhập Google bằng id_token (không qua redirect web). Liệt kê
  // các OAuth Client ID được phép làm "aud" của id_token, ngăn cách bằng dấu
  // phẩy — gồm Web/Android/iOS client ID mà app expo-auth-session sử dụng.
  // Trống = tắt đăng nhập Google trên app.
  GOOGLE_OAUTH_MOBILE_CLIENT_IDS: z.string().trim().default(""),
  // Slack CSKH: thiếu token hoặc kênh là tắt tích hợp, app vẫn chạy bình thường.
  SLACK_BOT_TOKEN: z.string().trim().default(""),
  SLACK_SUPPORT_CHANNEL: z.string().trim().default(""),
  SLACK_SIGNING_SECRET: z.string().trim().default(""),
  MIN_WITHDRAWAL_VND: z.coerce.number().int().positive().default(50000),
  MAX_WITHDRAWAL_VND: z.coerce.number().int().positive().default(20000000),
  TERMS_VERSION: z.string().min(1),
  PRIVACY_VERSION: z.string().min(1),

  // Nhóm nghiệp vụ dưới đây chỉ seed lần đầu; sau đó giá trị trong DB được ưu tiên.
  BUYER_CASHBACK_PERCENT: z.coerce.number().int().min(0).max(100).default(80),
  PLATFORM_SHARE_PERCENT: z.coerce.number().int().min(0).max(100).default(20),
  SHARER_REWARD_FROM_PLATFORM_PERCENT: z.coerce
    .number()
    .int()
    .min(0)
    .max(100)
    .default(20),
  REFERRER_REWARD_AMOUNT: z.coerce.number().int().min(0).default(0),
  REFERRED_USER_BONUS_AMOUNT: z.coerce.number().int().min(0).default(0),
  REFERRAL_REWARD_TRIGGER: z
    .enum(["first_approved_order"])
    .default("first_approved_order"),
  AFFILIATE_ATTRIBUTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  // Lượt bấm "Mua ngay" quá số ngày này mà đối soát vẫn chưa gán được đơn
  // thật thì tự xóa khỏi lịch sử (dọn lượt mua thử/không thành).
  INSTANTBUY_KEEP_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  CASHBACK_HOLD_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  MIN_WITHDRAW_AMOUNT: z.coerce.number().int().positive().default(100000),
  ENABLE_SHARE_LINK: booleanFromStringDefault("true"),
  ENABLE_REFERRAL_PROGRAM: booleanFromStringDefault("true"),

  // Tần suất đồng bộ từng sàn do admin đặt trong DB; biến này chỉ là nhịp kiểm tra.
  ENABLE_SYNC_SCHEDULER: booleanFromStringDefault("true"),
  SYNC_SCHEDULER_TICK_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(60),

  // JSON [{threshold, rewardVnd, title}] — chỉ seed mission_definitions lần đầu.
  MISSION_REFERRAL_MILESTONES_JSON: z
    .string()
    .default(
      '[{"threshold":50,"rewardVnd":10000,"title":"Mời 50 người"},{"threshold":100,"rewardVnd":50000,"title":"Mời 100 người"},{"threshold":150,"rewardVnd":150000,"title":"Mời 150 người"}]',
    ),
  MISSION_PURCHASE_MILESTONES_JSON: z
    .string()
    .default(
      '[{"threshold":3,"rewardVnd":20000,"title":"Mua 3 đơn trong tháng"},{"threshold":10,"rewardVnd":80000,"title":"Mua 10 đơn trong tháng"}]',
    ),

  ADMIN_SYNC_FROM_ENV: booleanFromString,
  ADMIN_STRICT_ALLOWLIST: booleanFromStringDefault("true"),
  ADMIN_RESET_PASSWORDS_ON_STARTUP: booleanFromString,
  ADMIN_ACCOUNTS_JSON: z.string().default("[]"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

let cachedConfig: z.infer<typeof configSchema> | undefined;

export function loadConfig(): z.infer<typeof configSchema> {
  if (cachedConfig) return cachedConfig;

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Cấu hình .env không hợp lệ: ${details}`);
  }

  const key = Buffer.from(parsed.data.FIELD_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY phải là khóa base64 đúng 32 byte.");
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    !parsed.data.APP_ORIGIN.startsWith("https://")
  ) {
    throw new Error("APP_ORIGIN phải dùng HTTPS trong production.");
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    parsed.data.EMAIL_MODE !== "smtp"
  ) {
    throw new Error("Production bắt buộc EMAIL_MODE=smtp.");
  }
  if (
    parsed.data.EMAIL_MODE === "smtp" &&
    (!parsed.data.SMTP_HOST || !parsed.data.SMTP_USER || !parsed.data.SMTP_PASS)
  ) {
    throw new Error("Thiếu SMTP_HOST, SMTP_USER hoặc SMTP_PASS.");
  }
  if (
    parsed.data.BUYER_CASHBACK_PERCENT + parsed.data.PLATFORM_SHARE_PERCENT !==
    100
  ) {
    throw new Error(
      "BUYER_CASHBACK_PERCENT + PLATFORM_SHARE_PERCENT phải bằng 100.",
    );
  }

  cachedConfig = parsed.data;
  return parsed.data;
}

export function resetConfigForTests(): void {
  cachedConfig = undefined;
}
