import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";

/**
 * Tạo một Postgres nhúng (PGlite) đã chạy đủ migrations, bọc lại để tương
 * thích với interface Database (pg.Pool) mà các service trong src/ dùng —
 * kể cả withTransaction (cần .connect()/.release()), vì PGlite hỗ trợ
 * BEGIN/COMMIT/ROLLBACK và tham số hoá $1 qua .query() trực tiếp.
 */
export async function createTestDb(): Promise<{
  db: Database;
  pglite: PGlite;
  close: () => Promise<void>;
}> {
  const pglite = new PGlite();
  const migrationDir = path.join(process.cwd(), "migrations");
  const migrations = (await readdir(migrationDir))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  for (const filename of migrations) {
    const sql = await readFile(
      path.join(migrationDir, filename),
      "utf8",
    );
    await pglite.exec(sql);
  }

  const queryFn = async (text: string, values?: unknown[]) => {
    const result = await pglite.query(text, values ?? []);
    // PGlite trả về affectedRows thay vì rowCount như driver pg thật —
    // chuẩn hoá lại để code sản xuất (kiểm tra .rowCount) chạy đúng khi test.
    return {
      ...result,
      rowCount:
        (result as { affectedRows?: number }).affectedRows ??
        result.rows.length,
    };
  };

  const db = {
    query: queryFn,
    connect: async () => ({
      query: queryFn,
      release: () => {},
    }),
  } as unknown as Database;

  return { db, pglite, close: () => pglite.close() };
}

export function testConfig(): AppConfig {
  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3000,
    APP_ORIGIN: "http://localhost:3000",
    APP_NAME: "ShopTik",
    TRUST_PROXY: false,
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    DATABASE_SSL: false,
    DATABASE_POOL_MAX: 2,
    REDIS_URL: "",
    APP_SECRET: "a".repeat(64),
    OTP_PEPPER: "b".repeat(64),
    IP_HASH_PEPPER: "c".repeat(64),
    FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    SESSION_TTL_HOURS: 168,
    MOBILE_ACCESS_TOKEN_TTL_MINUTES: 30,
    MOBILE_REFRESH_TOKEN_TTL_DAYS: 60,
    OTP_TTL_MINUTES: 10,
    OTP_MAX_ATTEMPTS: 5,
    OTP_MAX_SENDS_PER_HOUR: 5,
    EMAIL_MODE: "console",
    SMTP_HOST: "",
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM_NAME: "ShopTik",
    SMTP_FROM_EMAIL: "no-reply@example.com",
    SUPPORT_EMAIL: "",
    ADMIN_ALERT_EMAIL: "",
    ADMIN_ALERT_COOLDOWN_MINUTES: 30,
    SHOPEE_AFFILIATE_ID: "14354840000",
    HARVEST_WORKER_TOKEN: "",
    BROWSER_CONTROL_URL: "http://127.0.0.1:9222",
    SHOPEE_OPEN_API_APP_ID: "",
    SHOPEE_OPEN_API_SECRET: "",
    SHOPEE_PRODUCT_API_URL: "",
    SHOPEE_PRODUCT_API_TOKEN: "",
    SHOPEE_DEFAULT_COMMISSION_RATE_BPS: 0,
    SHOPEE_AFFILIATE_REDIRECT_HOSTS: "",
    TIKTOK_AFFILIATE_ID: "",
    TIKTOK_PRODUCT_API_URL: "",
    TIKTOK_PRODUCT_API_TOKEN: "",
    TIKTOK_DEFAULT_COMMISSION_RATE_BPS: 0,
    TIKTOK_AFFILIATE_REDIRECT_HOSTS: "",
    TIKTOK_OPEN_API_APP_KEY: "",
    TIKTOK_OPEN_API_APP_SECRET: "",
    TIKTOK_OPEN_API_ACCESS_TOKEN: "",
    TIKTOK_AFFILIATE_CAMPAIGN_ID: "",
    LAZADA_AFFILIATE_ID: "",
    LAZADA_AFFILIATE_MASTER_LINK: "",
    LAZADA_PRODUCT_API_URL: "",
    LAZADA_PRODUCT_API_TOKEN: "",
    LAZADA_DEFAULT_COMMISSION_RATE_BPS: 0,
    LAZADA_AFFILIATE_REDIRECT_HOSTS: "",
    LAZADA_OPEN_API_APP_KEY: "",
    LAZADA_OPEN_API_APP_SECRET: "",
    LAZADA_OPEN_API_ACCESS_TOKEN: "",
    LAZADA_AFFILIATE_USER_TOKEN: "",
    LAZADA_OAUTH_REDIRECT_URI: "",
    SHOPEE_PRODUCT_LOOKUP_TIMEOUT_MS: 8000,
    SLACK_BOT_TOKEN: "",
    SLACK_SUPPORT_CHANNEL: "",
    SLACK_SIGNING_SECRET: "",
    GOOGLE_OAUTH_CLIENT_ID: "",
    GOOGLE_OAUTH_CLIENT_SECRET: "",
    GOOGLE_OAUTH_REDIRECT_URI: "",
    GOOGLE_OAUTH_MOBILE_CLIENT_IDS: "",
    MIN_WITHDRAWAL_VND: 50000,
    MAX_WITHDRAWAL_VND: 20000000,
    TERMS_VERSION: "test",
    PRIVACY_VERSION: "test",
    BUYER_CASHBACK_PERCENT: 80,
    PLATFORM_SHARE_PERCENT: 20,
    SHARER_REWARD_FROM_PLATFORM_PERCENT: 20,
    REFERRER_REWARD_AMOUNT: 0,
    REFERRED_USER_BONUS_AMOUNT: 0,
    REFERRAL_REWARD_TRIGGER: "first_approved_order",
    AFFILIATE_ATTRIBUTION_DAYS: 30,
    INSTANTBUY_KEEP_DAYS: 1,
    CASHBACK_HOLD_DAYS: 30,
    MIN_WITHDRAW_AMOUNT: 100000,
    ENABLE_SHARE_LINK: true,
    ENABLE_REFERRAL_PROGRAM: true,
    ENABLE_SYNC_SCHEDULER: false,
    SYNC_SCHEDULER_TICK_SECONDS: 60,
    MISSION_REFERRAL_MILESTONES_JSON: "[]",
    MISSION_PURCHASE_MILESTONES_JSON: "[]",
    ADMIN_SYNC_FROM_ENV: false,
    ADMIN_STRICT_ALLOWLIST: true,
    ADMIN_RESET_PASSWORDS_ON_STARTUP: false,
    ADMIN_ACCOUNTS_JSON: "[]",
  };
}
