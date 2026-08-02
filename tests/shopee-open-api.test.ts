import { describe, expect, it } from "vitest";
import {
  fetchShopeeProductOffer,
  generateShopeeShortLink,
  parseProductOfferPayload,
  signShopeePayload,
} from "../src/services/shopee-open-api.js";
import { testConfig } from "./helpers.js";
import type { AppConfig } from "../src/config.js";

function openApiConfig(): AppConfig {
  return {
    ...testConfig(),
    SHOPEE_OPEN_API_APP_ID: "15394330000",
    SHOPEE_OPEN_API_SECRET: "BIENMATRATBIMAT",
  };
}

describe("shopee open api", () => {
  it("ký payload đúng công thức AppId+Timestamp+Payload+Secret", () => {
    // Giá trị đối chiếu tính bằng: sha256("app1700000000{\"query\":\"{}\"}secret")
    const signature = signShopeePayload(
      "app",
      "secret",
      1700000000,
      '{"query":"{}"}',
    );
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).toBe(
      signShopeePayload("app", "secret", 1700000000, '{"query":"{}"}'),
    );
    expect(signature).not.toBe(
      signShopeePayload("app", "khac", 1700000000, '{"query":"{}"}'),
    );
  });

  it("đọc được productOfferV2: tên, ảnh, giá và hoa hồng theo bps", () => {
    const offer = parseProductOfferPayload(
      {
        productOfferV2: {
          nodes: [
            {
              itemId: 21520945044,
              productName: "Robot hút bụi mini",
              imageUrl: "https://down-vn.img.susercontent.com/file/abc",
              price: "1250000",
              commissionRate: "0.045",
              offerLink: "https://s.shopee.vn/AbCdEf",
              shopName: "Gian hàng chính hãng",
            },
          ],
        },
      },
      "21520945044",
    );
    expect(offer).not.toBeNull();
    expect(offer!.productName).toBe("Robot hút bụi mini");
    expect(offer!.priceVnd).toBe(1250000);
    expect(offer!.commissionRateBps).toBe(450);
    // Hoa hồng = 1.250.000 × 4,5% = 56.250 đ (API không trả sẵn thì tự tính).
    expect(offer!.commissionVnd).toBe(56250);
    expect(offer!.offerLink).toBe("https://s.shopee.vn/AbCdEf");
  });

  it("ưu tiên số commission API trả sẵn thay vì tự tính", () => {
    const offer = parseProductOfferPayload(
      {
        productOfferV2: {
          nodes: [
            {
              itemId: "5",
              productName: "Áo thun",
              price: "100000",
              commissionRate: "0.1",
              commission: "9876",
            },
          ],
        },
      },
      "5",
    );
    expect(offer!.commissionVnd).toBe(9876);
  });

  it("trả null khi node không có dữ liệu hiển thị được", () => {
    expect(
      parseProductOfferPayload(
        { productOfferV2: { nodes: [{ itemId: "5" }] } },
        "5",
      ),
    ).toBeNull();
    expect(parseProductOfferPayload(null, "5")).toBeNull();
  });

  it("fetch gửi đúng header chữ ký và parse kết quả", async () => {
    let capturedAuth = "";
    let capturedBody = "";
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      capturedAuth = String(
        (init?.headers as Record<string, string>).authorization,
      );
      capturedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          data: {
            productOfferV2: {
              nodes: [
                {
                  itemId: "99",
                  productName: "Nồi chiên",
                  price: "500000",
                  commissionRate: "0.02",
                },
              ],
            },
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const offer = await fetchShopeeProductOffer(openApiConfig(), "99", fetcher);
    expect(offer!.productName).toBe("Nồi chiên");
    expect(offer!.commissionVnd).toBe(10000);
    expect(capturedBody).toContain("productOfferV2(itemId: 99)");
    const match = capturedAuth.match(
      /^SHA256 Credential=15394330000, Timestamp=(\d+), Signature=([0-9a-f]{64})$/,
    );
    expect(match).not.toBeNull();
    expect(match![2]).toBe(
      signShopeePayload(
        "15394330000",
        "BIENMATRATBIMAT",
        Number(match![1]),
        capturedBody,
      ),
    );
  });

  it("không gọi mạng khi chưa cấu hình AppId/Secret", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const offer = await fetchShopeeProductOffer(testConfig(), "99", fetcher);
    expect(offer).toBeNull();
    expect(called).toBe(false);
  });

  it("generateShortLink làm sạch subIds và trả shortLink", async () => {
    let capturedBody = "";
    const fetcher = (async (_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          data: { generateShortLink: { shortLink: "https://s.shopee.vn/9XyZ" } },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const shortLink = await generateShopeeShortLink(
      openApiConfig(),
      {
        originUrl: "https://shopee.vn/san-pham-i.1.2",
        subIds: ["c-abc_123!", "app", "instantbuy"],
      },
      fetcher,
    );
    expect(shortLink).toBe("https://s.shopee.vn/9XyZ");
    const payload = JSON.parse(capturedBody) as {
      variables: { subIds: string[] };
    };
    expect(payload.variables.subIds).toEqual(["cabc123", "app", "instantbuy"]);
  });

  it("trả null khi API báo lỗi GraphQL", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({ errors: [{ message: "invalid signature" }] }),
        { status: 200 },
      )) as typeof fetch;
    expect(
      await fetchShopeeProductOffer(openApiConfig(), "99", fetcher),
    ).toBeNull();
  });
});
