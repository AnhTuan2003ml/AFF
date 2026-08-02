import { describe, expect, it } from "vitest";
import {
  hashPassword,
  passwordSchema,
  verifyPassword,
} from "../src/lib/password.js";

describe("Password security", () => {
  it("yêu cầu mật khẩu đủ độ dài và độ phức tạp", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("onlylowercase123").success).toBe(false);
    expect(passwordSchema.safeParse("MatKhauManh123").success).toBe(true);
  });

  it("băm Argon2id và xác minh đúng", async () => {
    const hash = await hashPassword("MatKhauManh123");
    expect(hash).toContain("$argon2id$");
    expect(await verifyPassword(hash, "MatKhauManh123")).toBe(true);
    expect(await verifyPassword(hash, "SaiMatKhau123")).toBe(false);
  });
});
