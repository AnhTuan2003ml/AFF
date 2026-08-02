import { describe, expect, it } from "vitest";
import {
  fetchLazadaProductItem,
  isLazadaOpenApiConfigured,
  parseLazadaProductPayload,
  signLazadaRequest,
} from "../src/services/lazada-open-api.js";
import { testConfig } from "./helpers.js";
import type { AppConfig } from "../src/config.js";

function openApiConfig(): AppConfig {
  return {
    ...testConfig(),
    LAZADA_OPEN_API_APP_KEY: "123456",
    LAZADA_OPEN_API_APP_SECRET: "BIENMATRATBIMAT",
    LAZADA_OPEN_API_ACCESS_TOKEN: "token-abc",
  };
}

describe("lazada open api", () => {
  it("ký request theo lược đồ TOP: sắp xếp key A-Z, nối path+key+value, HMAC-SHA256 in hoa", () => {
    const sign = signLazadaRequest(
      "/product/item/get",
      { b: "2", a: "1" },
      "secret",
    );
    expect(sign).toMatch(/^[0-9A-F]{64}$/);
    // Thứ tự tham số không ảnh hưởng input vì hàm tự sắp xếp lại.
    expect(sign).toBe(
      signLazadaRequest("/product/item/get", { a: "1", b: "2" }, "secret"),
    );
    expect(sign).not.toBe(
      signLazadaRequest("/product/item/get", { a: "1", b: "9" }, "secret"),
    );
  });

  it("isLazadaOpenApiConfigured đúng khi đủ/thiếu credential", () => {
    expect(isLazadaOpenApiConfigured(testConfig())).toBe(false);
    expect(isLazadaOpenApiConfigured(openApiConfig())).toBe(true);
  });

  it("đọc được GetProductItem: tên, ảnh và giá bán (special_price) từ sku đầu tiên", () => {
    const item = parseLazadaProductPayload(
      {
        code: "0",
        data: {
          name: "Bàn phím cơ",
          images: ["https://laz-img-cdn.example/abc.jpg"],
          skus: [{ price: "450000", special_price: "399000" }],
        },
      },
      "2196649995",
    );
    expect(item).not.toBeNull();
    expect(item!.productName).toBe("Bàn phím cơ");
    expect(item!.imageUrl).toBe("https://laz-img-cdn.example/abc.jpg");
    // Người mua trả theo special_price (giá đang giảm) — price là giá gốc,
    // chỉ hiển thị gạch ngang khi cao hơn giá bán.
    expect(item!.priceVnd).toBe(399000);
    expect(item!.originalPriceVnd).toBe(450000);
  });

  it("không có originalPriceVnd khi special_price bằng price (không giảm giá)", () => {
    const item = parseLazadaProductPayload(
      {
        code: "0",
        data: {
          name: "Bàn phím cơ",
          images: ["https://laz-img-cdn.example/abc.jpg"],
          skus: [{ price: "450000", special_price: "450000" }],
        },
      },
      "2196649995",
    );
    expect(item!.priceVnd).toBe(450000);
    expect(item!.originalPriceVnd).toBeUndefined();
  });

  it("uu tien SKU dang chon thay vi SKU dau tien", () => {
    const item = parseLazadaProductPayload(
      {
        code: "0",
        data: {
          name: "May mai pin",
          images: ["https://laz-img-cdn.example/grinder.jpg"],
          skus: [
            { SkuId: "111", price: "121540", special_price: "121540" },
            { SkuId: "13314698197", price: "121540", special_price: "68600" },
          ],
        },
      },
      "2383196313",
      "13314698197",
    );

    expect(item!.skuId).toBe("13314698197");
    expect(item!.priceVnd).toBe(68600);
    expect(item!.originalPriceVnd).toBe(121540);
  });

  it("trả null khi payload báo lỗi hoặc không có dữ liệu hiển thị được", () => {
    expect(
      parseLazadaProductPayload({ code: "7", message: "Invalid Signature" }, "1"),
    ).toBeNull();
    expect(parseLazadaProductPayload({ code: "0", data: {} }, "1")).toBeNull();
    expect(parseLazadaProductPayload(null, "1")).toBeNull();
  });

  it("không gọi mạng khi chưa cấu hình App Key/Secret/Access Token", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const item = await fetchLazadaProductItem(testConfig(), "99", fetcher);
    expect(item).toBeNull();
    expect(called).toBe(false);
  });

  it("fetch gửi đúng tham số và chữ ký, parse kết quả trả về", async () => {
    let capturedUrl = "";
    const fetcher = (async (url: unknown) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          code: "0",
          data: {
            name: "Nồi chiên không dầu",
            images: ["https://laz-img-cdn.example/nc.jpg"],
            skus: [{ price: "1200000" }],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const item = await fetchLazadaProductItem(
      openApiConfig(),
      "2196649995",
      fetcher,
    );
    expect(item!.productName).toBe("Nồi chiên không dầu");
    expect(item!.priceVnd).toBe(1200000);

    const endpoint = new URL(capturedUrl);
    expect(endpoint.origin + endpoint.pathname).toBe(
      "https://api.lazada.vn/rest/product/item/get",
    );
    expect(endpoint.searchParams.get("app_key")).toBe("123456");
    expect(endpoint.searchParams.get("item_id")).toBe("2196649995");
    const sign = endpoint.searchParams.get("sign");
    expect(sign).toMatch(/^[0-9A-F]{64}$/);

    const params: Record<string, string> = {};
    endpoint.searchParams.forEach((value, key) => {
      if (key !== "sign") params[key] = value;
    });
    expect(sign).toBe(
      signLazadaRequest("/product/item/get", params, "BIENMATRATBIMAT"),
    );
  });

  it("từ chối item_id không hợp lệ mà không gọi mạng", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const item = await fetchLazadaProductItem(
      openApiConfig(),
      "khong-phai-so",
      fetcher,
    );
    expect(item).toBeNull();
    expect(called).toBe(false);
  });
});
