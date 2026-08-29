import { describe, expect, it } from "vitest";
import { parseLazadaAffiliateFeed } from "../src/services/lazada-affiliate-api.js";

// Shape lấy từ phản hồi thật của /marketing/product/feed (đã kiểm chứng).
function feed(item: Record<string, unknown>): unknown {
  return { code: "0", result: { success: true, data: [item] } };
}

describe("parseLazadaAffiliateFeed", () => {
  it("map hoa hồng thật: amount là VND, rate phân số → bps", () => {
    const parsed = parseLazadaAffiliateFeed(
      feed({
        productId: 96640700,
        productName: "Lenovo Thinkstation P",
        sellerName: "Lenovo",
        pictures: ["https://filebroker-cdn.lazada.vn/kf/x.jpg"],
        discountPrice: 96640700.0,
        totalCommissionRate: 0.05,
        totalCommissionAmount: 4832035.0,
      }),
      "96640700",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.priceVnd).toBe(96640700);
    expect(parsed?.commissionVnd).toBe(4832035);
    expect(parsed?.commissionRateBps).toBe(500); // 0.05 → 500 bps
    expect(parsed?.productName).toBe("Lenovo Thinkstation P");
    expect(parsed?.imageUrl).toContain("filebroker-cdn.lazada.vn");
  });

  it("commission 0 vẫn hợp lệ (sản phẩm không có hoàn, vd Apple)", () => {
    const parsed = parseLazadaAffiliateFeed(
      feed({
        productId: 3179765981,
        productName: "iPhone 17 Pro Max",
        discountPrice: 37990000,
        totalCommissionRate: 0,
        totalCommissionAmount: 0,
      }),
      "3179765981",
    );
    expect(parsed?.commissionVnd).toBe(0);
    expect(parsed?.commissionRateBps).toBe(0);
    expect(parsed?.priceVnd).toBe(37990000);
  });

  it("chọn đúng productId khi feed trả nhiều sản phẩm", () => {
    const payload = {
      code: "0",
      result: {
        success: true,
        data: [
          { productId: 111, productName: "Khác", discountPrice: 1000 },
          { productId: 222, productName: "Đúng", discountPrice: 2000, totalCommissionAmount: 200 },
        ],
      },
    };
    const parsed = parseLazadaAffiliateFeed(payload, "222");
    expect(parsed?.itemId).toBe("222");
    expect(parsed?.productName).toBe("Đúng");
    expect(parsed?.commissionVnd).toBe(200);
  });

  it("code lỗi hoặc data rỗng → null", () => {
    expect(
      parseLazadaAffiliateFeed({ code: "IllegalAccessToken" }, "1"),
    ).toBeNull();
    expect(
      parseLazadaAffiliateFeed({ code: "0", result: { data: [] } }, "1"),
    ).toBeNull();
  });
});
