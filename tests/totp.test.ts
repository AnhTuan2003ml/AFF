import { describe, expect, it } from "vitest";
import {
  generateTotpSecret,
  totpKeyUri,
  totpToken,
  verifyTotp,
} from "../src/lib/totp.js";

describe("TOTP (RFC 6238)", () => {
  it("secret sinh ra là base32 hợp lệ, đủ dài", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s.length).toBeGreaterThanOrEqual(32);
  });

  it("mã hiện tại verify đúng; mã sai bị từ chối", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const token = totpToken(secret, now);
    expect(verifyTotp(secret, token, { at: now })).toBe(true);
    expect(verifyTotp(secret, "000000", { at: now })).toBe(false);
    expect(verifyTotp(secret, "12345", { at: now })).toBe(false); // sai định dạng
    expect(verifyTotp(secret, "abcdef", { at: now })).toBe(false);
  });

  it("chấp nhận trượt ±1 bước (±30s), từ chối bước xa hơn", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const prev = totpToken(secret, now - 30_000);
    const next = totpToken(secret, now + 30_000);
    const far = totpToken(secret, now - 90_000);
    expect(verifyTotp(secret, prev, { at: now })).toBe(true);
    expect(verifyTotp(secret, next, { at: now })).toBe(true);
    expect(verifyTotp(secret, far, { at: now })).toBe(false);
  });

  it("mã của secret khác không verify chéo", () => {
    const now = 1_700_000_000_000;
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(verifyTotp(b, totpToken(a, now), { at: now })).toBe(false);
  });

  it("keyUri đúng chuẩn otpauth", () => {
    const uri = totpKeyUri("JBSWY3DPEHPK3PXP", "admin@shoptik.vn", "ShopTik Admin");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=ShopTik+Admin");
  });
});
