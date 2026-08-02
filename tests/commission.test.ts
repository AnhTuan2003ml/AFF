import { describe, expect, it } from "vitest";
import { computeCommissionSplit } from "../src/services/commission.js";

const RATES = {
  buyerCashbackPercent: 80,
  platformSharePercent: 20,
  sharerRewardFromPlatformPercent: 20,
};

describe("computeCommissionSplit", () => {
  it("mua trực tiếp: người mua 80%, nền tảng giữ 20%, không có sharer", () => {
    const split = computeCommissionSplit(100_000, RATES, false);
    expect(split.buyerVnd).toBe(80_000);
    expect(split.sharerVnd).toBe(0);
    expect(split.platformVnd).toBe(20_000);
    expect(split.buyerPercent).toBe(80);
    expect(split.platformPercent).toBe(20);
    expect(split.sharerPercent).toBe(0);
    expect(split.buyerVnd + split.sharerVnd + split.platformVnd).toBe(100_000);
  });

  it("mua qua link chia sẻ của người khác: 80/4/16", () => {
    const split = computeCommissionSplit(100_000, RATES, true);
    expect(split.buyerVnd).toBe(80_000);
    expect(split.sharerVnd).toBe(4_000);
    expect(split.platformVnd).toBe(16_000);
    expect(split.buyerPercent).toBe(80);
    expect(split.sharerPercent).toBe(4);
    expect(split.platformPercent).toBe(16);
    expect(split.buyerVnd + split.sharerVnd + split.platformVnd).toBe(100_000);
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
    const split2 = computeCommissionSplit(333_333, RATES, true);
    expect(split2.buyerVnd + split2.sharerVnd + split2.platformVnd).toBe(
      333_333,
    );
  });

  it("từ chối commissionVnd âm hoặc không nguyên", () => {
    expect(() => computeCommissionSplit(-1, RATES, false)).toThrow();
    expect(() => computeCommissionSplit(1.5, RATES, false)).toThrow();
  });

  it("từ chối tỷ lệ ngoài khoảng 0-100", () => {
    expect(() =>
      computeCommissionSplit(
        1000,
        { ...RATES, buyerCashbackPercent: 150 },
        false,
      ),
    ).toThrow();
  });
});
