import { describe, expect, it } from "vitest";
import { assertBalanced } from "../src/services/ledger.js";

describe("Double-entry ledger", () => {
  it("chấp nhận bút toán debit bằng credit", () => {
    expect(() =>
      assertBalanced([
        { accountId: "system", direction: "DEBIT", amountVnd: 125000 },
        { accountId: "user", direction: "CREDIT", amountVnd: 125000 },
      ]),
    ).not.toThrow();
  });

  it("từ chối bút toán lệch", () => {
    expect(() =>
      assertBalanced([
        { accountId: "system", direction: "DEBIT", amountVnd: 125000 },
        { accountId: "user", direction: "CREDIT", amountVnd: 124000 },
      ]),
    ).toThrow(/không cân bằng/i);
  });

  it("từ chối số tiền âm, lẻ hoặc thiếu đối ứng", () => {
    expect(() =>
      assertBalanced([
        { accountId: "user", direction: "CREDIT", amountVnd: -1 },
      ]),
    ).toThrow();
    expect(() =>
      assertBalanced([
        { accountId: "system", direction: "DEBIT", amountVnd: 1000.5 },
        { accountId: "user", direction: "CREDIT", amountVnd: 1000.5 },
      ]),
    ).toThrow();
  });
});
