import { describe, expect, it } from "vitest";
import { extractShopeeCookie } from "../src/services/shopee-report.js";

describe("extractShopeeCookie — hỗ trợ nhiều định dạng cookie", () => {
  it("chuỗi cookie thuần giữ nguyên", () => {
    expect(extractShopeeCookie("SPC_ST=abc; SPC_U=123")).toBe(
      "SPC_ST=abc; SPC_U=123",
    );
  });

  it("header 'cookie:' sao từ tab Network", () => {
    expect(extractShopeeCookie("cookie: SPC_ST=abc; SPC_U=123")).toBe(
      "SPC_ST=abc; SPC_U=123",
    );
  });

  it("bảng DevTools (Name/Value/Domain, tách TAB) — chỉ giữ cookie shopee", () => {
    const table = [
      "SAPISID\txyz\t.google.com\t/\tSession\t8",
      "sb\tfff\t.facebook.com\t/\tSession\t2",
      "SPC_F\tf7qh\t.shopee.vn\t/\t2027-08-30\t37",
      "SPC_ST\tstoken\t.shopee.vn\t/\t2027-09-14\t267",
      "SPC_U\t76149233\t.shopee.vn\t/\t2027-09-14\t13",
      "shopee_webUnique_ccd\tuuu\taffiliate.shopee.vn\t/\tSession\t20",
    ].join("\n");
    const cookie = extractShopeeCookie(table);
    const names = cookie.split("; ").map((pair) => pair.split("=")[0]);
    expect(names).toEqual([
      "SPC_F",
      "SPC_ST",
      "SPC_U",
      "shopee_webUnique_ccd",
    ]);
    expect(cookie).toContain("SPC_ST=stoken");
    expect(names).not.toContain("SAPISID");
  });

  it("bỏ dòng tiêu đề 'Name Value Domain' của bảng", () => {
    const table = [
      "Name\tValue\tDomain\tPath\tExpires\tSize",
      "SPC_ST\tstoken\t.shopee.vn\t/\t2027-09-14\t267",
    ].join("\n");
    expect(extractShopeeCookie(table)).toBe("SPC_ST=stoken");
  });

  it("file Netscape cookies.txt (7 cột)", () => {
    const netscape = [
      "# Netscape HTTP Cookie File",
      ".shopee.vn\tTRUE\t/\tTRUE\t1799999999\tSPC_ST\tstoken",
      ".google.com\tTRUE\t/\tTRUE\t1799999999\tSAPISID\txyz",
    ].join("\n");
    expect(extractShopeeCookie(netscape)).toBe("SPC_ST=stoken");
  });

  it("khử trùng cookie trùng tên — dòng sau thắng", () => {
    const table = [
      "SPC_ST\told\t.shopee.vn\t/\tSession\t3",
      "SPC_ST\tnew\t.shopee.vn\t/\tSession\t3",
    ].join("\n");
    expect(extractShopeeCookie(table)).toBe("SPC_ST=new");
  });

  it("nội dung rỗng hoặc không có cookie → ném lỗi", () => {
    expect(() => extractShopeeCookie("   ")).toThrow(/không hợp lệ/);
    expect(() => extractShopeeCookie("chỉ là văn bản")).toThrow(/không hợp lệ/);
  });
});
