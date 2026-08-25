import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { decryptField } from "../src/lib/crypto.js";
import {
  buildLazadaAuthorizationUrl,
  createLazadaOAuthState,
  exchangeLazadaAuthorizationCode,
  getLazadaOAuthRedirectUri,
  getLazadaTokenStatus,
  getValidLazadaAccessToken,
  verifyLazadaOAuthState,
} from "../src/services/lazada-oauth.js";
import { createTestDb, testConfig } from "./helpers.js";

function oauthConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...testConfig(),
    APP_ORIGIN: "https://shoptikvn.com",
    LAZADA_OPEN_API_APP_KEY: "123456",
    LAZADA_OPEN_API_APP_SECRET: "BIENMATRATBIMAT",
    ...overrides,
  };
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    code: "0",
    access_token: "atk-plain-1",
    refresh_token: "rtk-plain-1",
    expires_in: 604_800,
    refresh_expires_in: 2_592_000,
    country: "vn",
    account: "shop@example.com",
    account_id: "9001",
    country_user_info: [{ country: "vn", user_id: "9001" }],
    ...overrides,
  };
}

function jsonFetcher(
  payload: unknown,
  calls: URL[] = [],
): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("lazada oauth — URL & state", () => {
  it("callback mặc định suy ra từ APP_ORIGIN, production ra đúng shoptikvn.com", () => {
    expect(getLazadaOAuthRedirectUri(oauthConfig())).toBe(
      "https://shoptikvn.com/auth/lazada/callback",
    );
    expect(
      getLazadaOAuthRedirectUri(
        oauthConfig({ LAZADA_OAUTH_REDIRECT_URI: "https://x.example/cb" }),
      ),
    ).toBe("https://x.example/cb");
  });

  it("authorization URL có client_id, response_type=code, redirect_uri và state", () => {
    const config = oauthConfig();
    const state = createLazadaOAuthState(config);
    const url = new URL(buildLazadaAuthorizationUrl(config, state));
    expect(url.origin + url.pathname).toBe("https://auth.lazada.com/oauth/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("123456");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://shoptikvn.com/auth/lazada/callback",
    );
    expect(url.searchParams.get("state")).toBe(state);
  });

  it("state hợp lệ pass; bị sửa fail; hết hạn fail", () => {
    const config = oauthConfig();
    const state = createLazadaOAuthState(config);
    expect(verifyLazadaOAuthState(config, state)).toBe(true);
    expect(verifyLazadaOAuthState(config, state.slice(0, -2) + "xx")).toBe(false);
    expect(verifyLazadaOAuthState(config, "lz1.abc")).toBe(false);
    expect(verifyLazadaOAuthState(config, undefined)).toBe(false);
    const expired = createLazadaOAuthState(config, -1000);
    expect(verifyLazadaOAuthState(config, expired)).toBe(false);
  });
});

describe("lazada oauth — đổi code & lưu token mã hóa", () => {
  it("đổi code thành công: lưu token MÃ HÓA (không plaintext), status CONNECTED", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = oauthConfig();
    const calls: URL[] = [];

    const status = await exchangeLazadaAuthorizationCode(
      db,
      config,
      "auth-code-1",
      jsonFetcher(tokenResponse(), calls),
    );

    expect(calls[0]!.pathname).toBe("/rest/auth/token/create");
    expect(calls[0]!.searchParams.get("code")).toBe("auth-code-1");
    expect(calls[0]!.searchParams.get("app_key")).toBe("123456");
    expect(calls[0]!.searchParams.get("sign")).toMatch(/^[0-9A-F]{64}$/);

    expect(status.status).toBe("CONNECTED");
    expect(status.country).toBe("vn");
    expect(status.account).toBe("shop@example.com");

    const row = await db.query<{
      access_token_ciphertext: string;
      refresh_token_ciphertext: string;
    }>("SELECT access_token_ciphertext, refresh_token_ciphertext FROM lazada_oauth_tokens");
    const stored = row.rows[0]!;
    // DB không được chứa token plaintext.
    expect(stored.access_token_ciphertext).not.toContain("atk-plain-1");
    expect(stored.refresh_token_ciphertext).not.toContain("rtk-plain-1");
    // Giải mã lấy lại đúng token.
    expect(decryptField(stored.access_token_ciphertext, config)).toBe("atk-plain-1");
    expect(decryptField(stored.refresh_token_ciphertext, config)).toBe("rtk-plain-1");
  });

  it("Lazada trả lỗi hoặc payload hỏng → AppError, không lưu gì", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = oauthConfig();

    await expect(
      exchangeLazadaAuthorizationCode(
        db,
        config,
        "bad-code",
        jsonFetcher({ code: "IncompleteSignature", message: "sign mismatch" }),
      ),
    ).rejects.toThrow(/Lazada từ chối cấp token/);

    const malformed = (async () =>
      new Response("<html>not json</html>", { status: 200 })) as unknown as typeof fetch;
    await expect(
      exchangeLazadaAuthorizationCode(db, config, "bad-code", malformed),
    ).rejects.toThrow();

    const rows = await db.query("SELECT 1 FROM lazada_oauth_tokens");
    expect(rows.rows.length).toBe(0);
  });
});

describe("lazada oauth — tự refresh", () => {
  it("token còn hạn: dùng luôn, KHÔNG gọi refresh", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = oauthConfig();
    await exchangeLazadaAuthorizationCode(db, config, "c1", jsonFetcher(tokenResponse()));

    const calls: URL[] = [];
    const token = await getValidLazadaAccessToken(db, config, jsonFetcher({}, calls));
    expect(token).toBe("atk-plain-1");
    expect(calls.length).toBe(0);
  });

  it("sắp hết hạn (<30 phút): refresh, lưu access + refresh token MỚI", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = oauthConfig();
    // access chỉ còn 60 giây → dưới ngưỡng 30 phút.
    await exchangeLazadaAuthorizationCode(
      db,
      config,
      "c1",
      jsonFetcher(tokenResponse({ expires_in: 60 })),
    );

    const calls: URL[] = [];
    const token = await getValidLazadaAccessToken(
      db,
      config,
      jsonFetcher(
        tokenResponse({ access_token: "atk-plain-2", refresh_token: "rtk-plain-2" }),
        calls,
      ),
    );
    expect(token).toBe("atk-plain-2");
    expect(calls[0]!.pathname).toBe("/rest/auth/token/refresh");
    // refresh_token cũ được gửi lên, token mới được lưu lại (mã hóa).
    expect(calls[0]!.searchParams.get("refresh_token")).toBe("rtk-plain-1");
    const row = await db.query<{
      access_token_ciphertext: string;
      refresh_token_ciphertext: string;
      last_refresh_at: Date | null;
    }>(
      "SELECT access_token_ciphertext, refresh_token_ciphertext, last_refresh_at FROM lazada_oauth_tokens",
    );
    expect(decryptField(row.rows[0]!.access_token_ciphertext, config)).toBe("atk-plain-2");
    expect(decryptField(row.rows[0]!.refresh_token_ciphertext, config)).toBe("rtk-plain-2");
    expect(row.rows[0]!.last_refresh_at).not.toBeNull();
  });

  it("refresh token đã hết hạn → status REAUTH_REQUIRED, getValidLazadaAccessToken trả null", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const config = oauthConfig();
    await exchangeLazadaAuthorizationCode(
      db,
      config,
      "c1",
      jsonFetcher(tokenResponse({ expires_in: 60, refresh_expires_in: 1 })),
    );
    // Cho refresh token hết hạn hẳn.
    await db.query(
      "UPDATE lazada_oauth_tokens SET refresh_token_expires_at = now() - interval '1 minute'",
    );

    const status = await getLazadaTokenStatus(db, config);
    expect(status.status).toBe("REAUTH_REQUIRED");

    const calls: URL[] = [];
    const token = await getValidLazadaAccessToken(db, config, jsonFetcher({}, calls));
    expect(token).toBeNull();
    expect(calls.length).toBe(0);
  });

  it("chưa cấu hình app key/secret → NOT_CONFIGURED; chưa có token → NOT_CONNECTED", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    expect((await getLazadaTokenStatus(db, testConfig())).status).toBe("NOT_CONFIGURED");
    expect((await getLazadaTokenStatus(db, oauthConfig())).status).toBe("NOT_CONNECTED");
  });
});
