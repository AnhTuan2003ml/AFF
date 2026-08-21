import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { isAllowedOrigin, registerCsrfProtection } from "../src/auth/csrf.js";
import { testConfig } from "./helpers.js";

/**
 * App tối giản để thử hook CSRF thật: cookie ký + hook + hai route dưới /api
 * (để lỗi trả JSON, không cần plugin view). Không cần DB.
 */
async function buildApp(trustProxy = false): Promise<FastifyInstance> {
  const config = testConfig();
  const app = Fastify({ trustProxy });
  await app.register(cookie, { secret: config.APP_SECRET });
  await registerCsrfProtection(app, config);
  app.get("/api/token", async (request) => ({ token: request.csrfToken }));
  app.post("/api/echo", async () => ({ ok: true }));
  await app.ready();
  return app;
}

/** Lấy cookie aff_csrf + token khớp với nó, như trình duyệt sau lần GET đầu. */
async function freshSession(app: FastifyInstance) {
  const res = await app.inject({ method: "GET", url: "/api/token" });
  const csrfCookie = res.cookies.find((c) => c.name === "aff_csrf");
  if (!csrfCookie) throw new Error("thiếu cookie aff_csrf");
  return {
    cookies: { aff_csrf: csrfCookie.value },
    token: (res.json() as { token: string }).token,
  };
}

describe("isAllowedOrigin", () => {
  it("khớp một origin, không phân biệt hoa thường và bỏ qua path", () => {
    expect(isAllowedOrigin("http://LOCALHOST:3000/dang-ky", "http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3002", "http://localhost:3000")).toBe(false);
  });

  it("khớp bất kỳ origin nào trong danh sách, bỏ qua phần tử null", () => {
    expect(isAllowedOrigin("http://localhost:3002", ["http://localhost:3000", null, "http://localhost:3002"])).toBe(true);
    expect(isAllowedOrigin("http://evil.example", ["http://localhost:3000", null])).toBe(false);
  });

  it("từ chối origin không phải URL", () => {
    expect(isAllowedOrigin("null", "http://localhost:3000")).toBe(false);
    expect(isAllowedOrigin("", ["http://localhost:3000"])).toBe(false);
  });
});

describe("CSRF: kiểm tra Origin theo APP_ORIGIN hoặc chính host đang nhận request", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("Origin trùng APP_ORIGIN + token hợp lệ → đi qua", async () => {
    app = await buildApp();
    const s = await freshSession(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { origin: "http://localhost:3000", host: "localhost:3000", "x-csrf-token": s.token },
      cookies: s.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it("mở server bằng địa chỉ khác APP_ORIGIN (vd Docker localhost:3002) vẫn đi qua khi Origin trùng Host", async () => {
    app = await buildApp();
    const s = await freshSession(app);
    for (const host of ["localhost:3002", "127.0.0.1:3000", "192.168.1.204:3000"]) {
      const res = await app.inject({
        method: "POST",
        url: "/api/echo",
        headers: { origin: `http://${host}`, host, "x-csrf-token": s.token },
        cookies: s.cookies,
        payload: {},
      });
      expect(res.statusCode, host).toBe(200);
    }
  });

  it("Origin lạ (khác cả APP_ORIGIN lẫn Host) → 403 INVALID_ORIGIN dù token đúng", async () => {
    app = await buildApp();
    const s = await freshSession(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { origin: "http://evil.example", host: "localhost:3000", "x-csrf-token": s.token },
      cookies: s.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVALID_ORIGIN");
  });

  it("Origin trùng Host nhưng thiếu token → vẫn 403 INVALID_CSRF (nới Origin không bỏ bước token)", async () => {
    app = await buildApp();
    const s = await freshSession(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/echo",
      headers: { origin: "http://localhost:3002", host: "localhost:3002" },
      cookies: s.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVALID_CSRF");
  });

  it("sau reverse proxy (TRUST_PROXY): lấy X-Forwarded-Proto/Host làm origin của request", async () => {
    app = await buildApp(true);
    const s = await freshSession(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/echo",
      remoteAddress: "127.0.0.1",
      headers: {
        origin: "https://shoptikvn.com",
        host: "web:3000",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "shoptikvn.com",
        "x-csrf-token": s.token,
      },
      cookies: s.cookies,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET không bị chặn dù Origin lạ", async () => {
    app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/token",
      headers: { origin: "http://evil.example", host: "localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
  });
});
