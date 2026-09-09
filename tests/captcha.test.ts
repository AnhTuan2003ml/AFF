import { describe, expect, it } from "vitest";
import {
  captchaEnabled,
  captchaSiteKey,
  verifyCaptcha,
} from "../src/services/captcha.js";
import { testConfig } from "./helpers.js";

describe("captcha (Turnstile)", () => {
  it("tắt khi thiếu key → enabled=false, verify luôn true", async () => {
    const config = testConfig();
    expect(captchaEnabled(config)).toBe(false);
    expect(captchaSiteKey(config)).toBe("");
    // Tắt → không chặn dù không có token.
    expect(await verifyCaptcha(config, undefined)).toBe(true);
  });

  it("bật nhưng thiếu token → false (fail-closed, không gọi mạng)", async () => {
    const config = { ...testConfig(), TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
    expect(captchaEnabled(config)).toBe(true);
    expect(captchaSiteKey(config)).toBe("site");
    expect(await verifyCaptcha(config, undefined)).toBe(false);
    expect(await verifyCaptcha(config, "")).toBe(false);
  });
});
