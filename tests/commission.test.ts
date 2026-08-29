import { describe, expect, it } from "vitest";
import {
  computeCommissionSplit,
  resolveBuyerPercent,
} from "../src/services/commission.js";

// Chính sách 2026-08-29: nền tảng LUÔN 40% (=100−buyer); người giới thiệu 6%
// TRÍCH TỪ phần người mua → người mua 60% (không có F1) hoặc 54% (có F1).
// Đơn ≤ 25.000₫: người mua 80% (nền tảng 20%).
const RATES = { buyerCashbackPercent: 60, sharerSharePercent: 6 };
const SPECIAL = { buyerCashbackPercent: 60, sharerSharePercent: 10 };
const SMALL_CFG = {
  buyerCashbackPercent: 60,
  smallOrderThresholdVnd: 25_000,
  smallOrderBuyerPercent: 80,
};

describe("computeCommissionSplit", () => {
  it("không có người giới thiệu: người mua 60%, nền tảng 40%", () => {
    const split = computeCommissionSplit(100_000, RATES, false);
    expect(split.buyerVnd).toBe(60_000);
    expect(split.sharerVnd).toBe(0);
    expect(split.platformVnd).toBe(40_000);
    expect(split.buyerPercent).toBe(60);
    expect(split.platformPercent).toBe(40);
    expect(split.sharerPercent).toBe(0);
    expect(split.buyerVnd + split.sharerVnd + split.platformVnd).toBe(100_000);
  });

  it("có người giới thiệu: 54/6/40 — F1 trích từ phần người mua, nền tảng vẫn 40%", () => {
    const split = computeCommissionSplit(100_000, RATES, true);
    expect(split.buyerVnd).toBe(54_000);
    expect(split.sharerVnd).toBe(6_000);
    expect(split.platformVnd).toBe(40_000);
    expect(split.buyerPercent).toBe(54);
    expect(split.sharerPercent).toBe(6);
    expect(split.platformPercent).toBe(40);
  });

  it("tỷ lệ F1 khác (10%): 50/10/40 — nền tảng luôn 40%", () => {
    const split = computeCommissionSplit(100_000, SPECIAL, true);
    expect(split.buyerVnd).toBe(50_000);
    expect(split.sharerVnd).toBe(10_000);
    expect(split.platformVnd).toBe(40_000);
  });

  it("đơn nhỏ (người mua 80%) có F1: 74/6/20", () => {
    const split = computeCommissionSplit(
      10_000,
      { buyerCashbackPercent: 80, sharerSharePercent: 6 },
      true,
    );
    expect(split.buyerVnd).toBe(7_400);
    expect(split.sharerVnd).toBe(600);
    expect(split.platformVnd).toBe(2_000);
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

  it("từ chối tỷ lệ ngoài 0-100, hoặc F1 vượt tỷ lệ người mua", () => {
    expect(() =>
      computeCommissionSplit(
        1000,
        { buyerCashbackPercent: 150, sharerSharePercent: 6 },
        false,
      ),
    ).toThrow();
    // F1 (10%) vượt tỷ lệ người mua (5%) → không hợp lệ.
    expect(() =>
      computeCommissionSplit(
        1000,
        { buyerCashbackPercent: 5, sharerSharePercent: 10 },
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
