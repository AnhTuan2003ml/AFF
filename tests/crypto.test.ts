import { describe, expect, it } from "vitest";
import {
  decryptField,
  encryptField,
  lastFour,
  maskAccountName,
  safeStringEqual,
} from "../src/lib/crypto.js";
import { testConfig } from "./helpers.js";

describe("Field encryption", () => {
  it("mã hóa có IV ngẫu nhiên và giải mã đúng", () => {
    const config = testConfig();
    const first = encryptField("0123456789", config);
    const second = encryptField("0123456789", config);
    expect(first).not.toBe(second);
    expect(decryptField(first, config)).toBe("0123456789");
    expect(decryptField(second, config)).toBe("0123456789");
  });

  it("phát hiện ciphertext bị sửa", () => {
    const config = testConfig();
    const encrypted = encryptField("NGUYEN VAN A", config);
    const changed = `${encrypted.slice(0, -2)}AA`;
    expect(() => decryptField(changed, config)).toThrow();
  });

  it("chỉ hiển thị dữ liệu đã che", () => {
    expect(lastFour("0123456789")).toBe("6789");
    expect(maskAccountName("NGUYEN VAN A")).toBe("N***** V** A*");
  });

  it("so sánh chuỗi an toàn", () => {
    expect(safeStringEqual("abc123", "abc123")).toBe(true);
    expect(safeStringEqual("abc123", "abc124")).toBe(false);
    expect(safeStringEqual("short", "longer")).toBe(false);
  });
});
