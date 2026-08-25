import { describe, expect, it } from "vitest";
import {
  computeCommissionSplit,
  resolveBuyerPercent,
} from "../src/services/commission.js";

// Chính sách 2026-08-25: người mua 60%, đối tác giới thiệu 5% (đặc biệt 10%)
// TRỰC TIẾP trên hoa hồng, nền tảng giữ phần còn lại; đơn ≤ 25.000₫ → 80%.
const RATES = { buyerCashbackPercent: 60, sharerSharePercent: 5 };
const SPECIAL = { buyerCashbackPercent: 60, sharerSharePercent: 10 };
const SMALL_CFG = {
  buyerCashbackPercent: 60,
  smallOrderThresholdVnd: 25_000,
  smallOrderBuyerPercent: 80,
};

describe("computeCommissionSplit", () => {
  it("mua trực tiếp: người mua 60%, nền tảng giữ 40% (không có người giới thiệu)", () => {
    const split = computeCommissionSplit(100_000, RATES, false);
    expect(split.buyerVnd).toBe(60_000);
    expect(split.sharerVnd).toBe(0);
    expect(split.platformVnd).toBe(40_000);
    expect(split.buyerPercent).toBe(60);
    expect(split.platformPercent).toBe(40);
    expect(split.sharerPercent).toBe(0);
    expect(split.buyerVnd + split.sharerVnd + split.platformVnd).toBe(100_000);
  });

  it("có đối tác giới thiệu: 60/5/35 — phần giới thiệu tính trực tiếp trên hoa hồng", () => {
    const split = computeCommissionSplit(100_000, RATES, true);
    expect(split.buyerVnd).toBe(60_000);
    expect(split.sharerVnd).toBe(5_000);
    expect(split.platformVnd).toBe(35_000);
    expect(split.buyerPercent).toBe(60);
    expect(split.sharerPercent).toBe(5);
    expect(split.platformPercent).toBe(35);
  });

  it("đối tác ĐẶC BIỆT: 60/10/30", () => {
    const split = computeCommissionSplit(100_000, SPECIAL, true);
    expect(split.buyerVnd).toBe(60_000);
    expect(split.sharerVnd).toBe(10_000);
    expect(split.platformVnd).toBe(30_000);
  });

  it("đơn nhỏ (≤25k) người mua 80%: 80/5/15", () => {
    const split = computeCommissionSplit(
      10_000,
      { buyerCashbackPercent: 80, sharerSharePercent: 5 },
      true,
    );
    expect(split.buyerVnd).toBe(8_000);
    expect(split.sharerVnd).toBe(500);
    expect(split.platformVnd).toBe(1_500);
  });

  it("hoa hồng 0 (không có đơn hợp lệ) => không phần nào được trả", () => {
    const split = computeCommissionSplit(0, RATES, true);
    expect(split.buyerVnd).toBe(0);
    expect(split.sharerVnd).toBe(0);
    expect(split.platformVnd).toBe(0);
  });

  it("làm tròn: phần dư luôn gán cho nền tảng để tổng khớp chính xác commissionVnd", () => {
    const split = computeCommissionSplit(1, RATES, true);
    expect(split.buyerVnd + split.sharerVnd + split.platformVnd).toBe(1);
    const split2 = computeCommissionSplit(333_333, SPECIAL, true);
    expect(split2.buyerVnd + split2.sharerVnd + split2.platformVnd).toBe(
      333_333,
    );
  });

  it("từ chối commissionVnd âm hoặc không nguyên", () => {
    expect(() => computeCommissionSplit(-1, RATES, false)).toThrow();
    expect(() => computeCommissionSplit(1.5, RATES, false)).toThrow();
  });

  it("từ chối tỷ lệ ngoài khoảng 0-100 hoặc tổng vượt 100", () => {
    expect(() =>
      computeCommissionSplit(
        1000,
        { buyerCashbackPercent: 150, sharerSharePercent: 5 },
        false,
      ),
    ).toThrow();
    expect(() =>
      computeCommissionSplit(
        1000,
        { buyerCashbackPercent: 98, sharerSharePercent: 5 },
        true,
      ),
    ).toThrow();
  });
});

describe("resolveBuyerPercent (đơn nhỏ nhận tới 80%)", () => {
  it("đơn ≤ 25.000₫ nhận 80%", () => {
    expect(resolveBuyerPercent(25_000, SMALL_CFG)).toBe(80);
    expect(resolveBuyerPercent(10_000, SMALL_CFG)).toBe(80);
  });
  it("đơn trên ngưỡng nhận 60%", () => {
    expect(resolveBuyerPercent(25_001, SMALL_CFG)).toBe(60);
    expect(resolveBuyerPercent(1_000_000, SMALL_CFG)).toBe(60);
  });
  it("đơn chưa rõ giá trị (null/0) dùng tỷ lệ chuẩn, không tự nâng", () => {
    expect(resolveBuyerPercent(null, SMALL_CFG)).toBe(60);
    expect(resolveBuyerPercent(0, SMALL_CFG)).toBe(60);
  });
  it("tắt ngưỡng (0) thì luôn dùng tỷ lệ chuẩn", () => {
    expect(
      resolveBuyerPercent(10_000, { ...SMALL_CFG, smallOrderThresholdVnd: 0 }),
    ).toBe(60);
  });
});
