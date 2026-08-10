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
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(100).default(10),
  REDIS_URL: z.string().optional().default(""),
  APP_SECRET: z.string().min(32),
  OTP_PEPPER: z.string().min(32),
  IP_HASH_PEPPER: z.string().min(32),
  FIELD_ENCRYPTION_KEY: z.string().min(1),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
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
  SHOPEE_AFFILIATE_ID: z.string().default(""),
  // Shopee Affiliate Open Platform (open-api.affiliate.shopee.vn).
  // Lấy AppId + Secret tại affiliate.shopee.vn → Công cụ → API.
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
  // TikTok Shop Open API chính thức (partner.tiktokshop.com) — cần được
  // duyệt "TikTok Shop Affiliate Partner"/seller app mới có App Key/Secret.
  // Access token lấy qua luồng OAuth của TikTok, dán thủ công tại đây và tự
  // gia hạn khi hết hạn (app này chưa tự động refresh token).
  TIKTOK_OPEN_API_APP_KEY: z.string().trim().default(""),
  TIKTOK_OPEN_API_APP_SECRET: z.string().trim().default(""),
  TIKTOK_OPEN_API_ACCESS_TOKEN: z.string().trim().default(""),
  // Campaign ID của General Publisher/TAP nếu TikTok yêu cầu material nằm
  // trong campaign trước khi tạo sharing link. Có thể để trống nếu app được
  // cấp quyền tạo link trực tiếp cho Open Collaboration.
  TIKTOK_AFFILIATE_CAMPAIGN_ID: z.string().trim().default(""),
  LAZADA_AFFILIATE_ID: z.string().default(""),
  // Master Link định danh LazAffiliates, ví dụ https://c.lazada.vn/t/c.xxxxx.
  // Link chia sẻ s.lazada.vn và mã/referral code không thay thế được Master
  // Link. Chỉ fallback sang LAZADA_AFFILIATE_ID khi giá trị đó đã là link
  // đầy đủ hoặc mã đúng dạng c.xxxxx.
  LAZADA_AFFILIATE_MASTER_LINK: z.string().trim().default(""),
  LAZADA_PRODUCT_API_URL: httpsUrlOrEmpty,
  LAZADA_PRODUCT_API_TOKEN: z.string().default(""),
  LAZADA_DEFAULT_COMMISSION_RATE_BPS: commissionRateBps,
  LAZADA_AFFILIATE_REDIRECT_HOSTS: z.string().default(""),
  // Lazada Open Platform chính thức (open.lazada.com) — cần tạo app + được
  // duyệt mới có App Key/Secret. Access token lấy qua luồng OAuth của
  // Lazada, dán thủ công tại đây (app này chưa tự động refresh token).
  LAZADA_OPEN_API_APP_KEY: z.string().trim().default(""),
  LAZADA_OPEN_API_APP_SECRET: z.string().trim().default(""),
  LAZADA_OPEN_API_ACCESS_TOKEN: z.string().trim().default(""),
  SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(8000),
  // Link nhóm cộng đồng (hiện nút nổi góc phải dưới khi được đặt).
  COMMUNITY_ZALO_URL: httpsUrlOrEmpty,
  COMMUNITY_TELEGRAM_URL: httpsUrlOrEmpty,
  MIN_WITHDRAWAL_VND: z.coerce.number().int().positive().default(50000),
  MAX_WITHDRAWAL_VND: z.coerce.number().int().positive().default(20000000),
  TERMS_VERSION: z.string().min(1),
  PRIVACY_VERSION: z.string().min(1),

  // Cấu hình nghiệp vụ hoa hồng/chia sẻ. Đây là giá trị SEED khi khởi tạo lần
  // đầu (business_config trống) — sau đó giá trị admin lưu trong DB được ưu
  // tiên và có hiệu lực ngay, không cần sửa .env hay khởi động lại.
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
  CASHBACK_HOLD_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  MIN_WITHDRAW_AMOUNT: z.coerce.number().int().positive().default(100000),
  ENABLE_SHARE_LINK: booleanFromStringDefault("true"),
  ENABLE_REFERRAL_PROGRAM: booleanFromStringDefault("true"),

  // Tiến trình nền: đồng bộ báo cáo sàn và giải ngân tiền hoàn đến hạn.
  // Tần suất đồng bộ từng sàn do admin đặt trong Backoffice > Đồng bộ sàn;
  // biến này chỉ điều khiển nhịp kiểm tra của scheduler.
  ENABLE_SYNC_SCHEDULER: booleanFromStringDefault("true"),
  SYNC_SCHEDULER_TICK_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(60),

  // Mốc thưởng nhiệm vụ (JSON mảng {threshold, rewardVnd, title}) — chỉ dùng
  // để SEED bảng mission_definitions khi bảng còn trống lần đầu; sau đó admin
  // sửa trong Backoffice > Nhiệm vụ, DB là nguồn thật.
  MISSION_REFERRAL_MILESTONES_JSON: z
    .string()
    .default(
      '[{"threshold":1,"rewardVnd":10000,"title":"Mời 1 người"},{"threshold":5,"rewardVnd":50000,"title":"Mời 5 người"},{"threshold":10,"rewardVnd":150000,"title":"Mời 10 người"}]',
    ),
  MISSION_PURCHASE_MILESTONES_JSON: z
    .string()
    .default(
      '[{"threshold":3,"rewardVnd":20000,"title":"Mua 3 đơn trong tháng"},{"threshold":10,"rewardVnd":80000,"title":"Mua 10 đơn trong tháng"}]',
    ),

  // Quản lý tài khoản admin từ ENV (allowlist đồng bộ khi khởi động).
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
