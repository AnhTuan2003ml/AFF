import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../src/db.js";
import type { EmailService } from "../src/services/email.js";
import {
  findOrCreateGoogleUser,
  googleOAuthEnabled,
  googleRedirectUri,
  type GoogleProfile,
} from "../src/services/google-auth.js";
import { createTestDb, testConfig } from "./helpers.js";

const config = testConfig();
const emailStub = () =>
  ({ sendUserPolicy: async () => undefined }) as unknown as EmailService;
const request = { ip: "127.0.0.1" } as unknown as FastifyRequest;

function profile(overrides: Partial<GoogleProfile> = {}): GoogleProfile {
  return {
    sub: "google-sub-1",
    email: "khach@example.com",
    emailVerified: true,
    name: "Nguyễn Văn A",
    avatarUrl: "",
    ...overrides,
  };
}

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

describe("findOrCreateGoogleUser", () => {
  it("tạo tài khoản mới đã kích hoạt sẵn, không mật khẩu", async () => {
    const result = await findOrCreateGoogleUser(
      db,
      emailStub(),
      config,
      request,
      profile(),
    );
    expect(result.isNew).toBe(true);

    const user = await db.query(
      "SELECT status, password_hash, email_verified_at FROM users WHERE id = $1",
      [result.userId],
    );
    expect(user.rows[0]?.status).toBe("ACTIVE");
    expect(user.rows[0]?.password_hash).toBeNull();
    expect(user.rows[0]?.email_verified_at).not.toBeNull();

    const identity = await db.query(
      "SELECT provider, provider_subject FROM auth_identities WHERE user_id = $1",
      [result.userId],
    );
    expect(identity.rows[0]?.provider).toBe("GOOGLE");
    expect(identity.rows[0]?.provider_subject).toBe("google-sub-1");
  });

  it("đăng nhập lại cùng tài khoản Google trả về đúng user, không tạo trùng", async () => {
    const first = await findOrCreateGoogleUser(
      db,
      emailStub(),
      config,
      request,
      profile(),
    );
    const second = await findOrCreateGoogleUser(
      db,
      emailStub(),
      config,
      request,
      profile({ name: "Tên đổi khác" }),
    );
    expect(second.isNew).toBe(false);
    expect(second.userId).toBe(first.userId);

    const count = await db.query("SELECT count(*)::int AS n FROM users");
    expect(count.rows[0]?.n).toBe(1);
  });

  it("liên kết Google vào email đã có tài khoản (đăng ký mật khẩu trước đó)", async () => {
    const inserted = await db.query(
      `
        INSERT INTO users (email, full_name, password_hash, status, referral_code)
        VALUES ($1, $2, $3, 'ACTIVE', $4)
        RETURNING id
      `,
      ["khach@example.com", "Chủ Cũ", "argon2-hash", "REF00001"],
    );
    const existingId = inserted.rows[0]?.id as string;

    const result = await findOrCreateGoogleUser(
      db,
      emailStub(),
      config,
      request,
      profile(),
    );
    expect(result.isNew).toBe(false);
    expect(result.userId).toBe(existingId);

    const identity = await db.query(
      "SELECT provider FROM auth_identities WHERE user_id = $1 AND provider = 'GOOGLE'",
      [existingId],
    );
    expect(identity.rows.length).toBe(1);
  });

  it("kích hoạt tài khoản đang chờ xác nhận email khi đăng nhập Google", async () => {
    const inserted = await db.query(
      `
        INSERT INTO users (email, full_name, password_hash, status, referral_code)
        VALUES ($1, $2, $3, 'PENDING_EMAIL', $4)
        RETURNING id
      `,
      ["khach@example.com", "Chờ xác nhận", "argon2-hash", "REF00002"],
    );
    const pendingId = inserted.rows[0]?.id as string;

    const result = await findOrCreateGoogleUser(
      db,
      emailStub(),
      config,
      request,
      profile(),
    );
    expect(result.userId).toBe(pendingId);

    const user = await db.query("SELECT status FROM users WHERE id = $1", [
      pendingId,
    ]);
    expect(user.rows[0]?.status).toBe("ACTIVE");
  });

  it("từ chối khi email Google chưa được xác thực", async () => {
    await expect(
      findOrCreateGoogleUser(
        db,
        emailStub(),
        config,
        request,
        profile({ emailVerified: false }),
      ),
    ).rejects.toThrow();
  });

  it("từ chối liên kết vào tài khoản đang bị khóa", async () => {
    await db.query(
      `
        INSERT INTO users (email, full_name, password_hash, status, referral_code)
        VALUES ($1, $2, $3, 'DISABLED', $4)
      `,
      ["khach@example.com", "Bị khóa", "argon2-hash", "REF00003"],
    );
    await expect(
      findOrCreateGoogleUser(db, emailStub(), config, request, profile()),
    ).rejects.toThrow();
  });
});

describe("cấu hình Google OAuth", () => {
  it("chỉ bật khi có đủ client id và secret", () => {
    expect(googleOAuthEnabled(config)).toBe(false);
    expect(
      googleOAuthEnabled({
        ...config,
        GOOGLE_OAUTH_CLIENT_ID: "id",
        GOOGLE_OAUTH_CLIENT_SECRET: "secret",
      }),
    ).toBe(true);
  });

  it("suy ra redirect URI từ APP_ORIGIN khi không khai báo riêng", () => {
    expect(googleRedirectUri(config)).toBe(
      "http://localhost:3000/auth/google/callback",
    );
    expect(
      googleRedirectUri({
        ...config,
        GOOGLE_OAUTH_REDIRECT_URI: "https://x.example/cb",
      }),
    ).toBe("https://x.example/cb");
  });
});
