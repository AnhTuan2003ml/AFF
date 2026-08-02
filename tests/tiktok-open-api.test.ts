import { describe, expect, it } from "vitest";
import {
  fetchTikTokAffiliateProduct,
  generateTikTokAffiliateSharingLink,
  isTikTokOpenApiConfigured,
  parseTikTokProductId,
  parseTikTokProductPayload,
  signTikTokRequest,
} from "../src/services/tiktok-open-api.js";
import { testConfig } from "./helpers.js";
import type { AppConfig } from "../src/config.js";

function openApiConfig(): AppConfig {
  return {
    ...testConfig(),
    TIKTOK_OPEN_API_APP_KEY: "app-key-123456",
    TIKTOK_OPEN_API_APP_SECRET: "BIENMATRATBIMAT",
    TIKTOK_OPEN_API_ACCESS_TOKEN: "token-abc",
  };
}

describe("tiktok affiliate creator api", () => {
  it("ký request ổn định theo sorted params", () => {
    const path = "/affiliate_creator/202509/open_collaborations/products";
    const sign = signTikTokRequest({
      path,
      query: { b: "2", a: "1" },
      body: "{}",
      appSecret: "secret",
    });
    expect(sign).toMatch(/^[0-9a-f]{64}$/);
    expect(sign).toBe(
      signTikTokRequest({
        path,
        query: { a: "1", b: "2" },
        body: "{}",
        appSecret: "secret",
      }),
    );
  });

  it("nhận biết đủ credential", () => {
    expect(isTikTokOpenApiConfigured(testConfig())).toBe(false);
    expect(isTikTokOpenApiConfigured(openApiConfig())).toBe(true);
  });

  it("đọc payload Creator API mới với Money object và hoa hồng bps", () => {
    const product = parseTikTokProductPayload(
      {
        code: 0,
        data: {
          products: [
            {
              id: "1729501987168522656",
              title: "Tai nghe bluetooth",
              main_image: { url: "https://p16-oec-va.example/tn.jpg" },
              sale_price: { minimum_amount: "350000", currency: "VND" },
              original_price: { amount: "450000", currency: "VND" },
              commission_rate: 1800,
            },
          ],
        },
      },
      "1729501987168522656",
    );
    expect(product).toMatchObject({
      productName: "Tai nghe bluetooth",
      priceVnd: 350000,
      originalPriceVnd: 450000,
      commissionRateBps: 1800,
    });
  });

  it("không coi tiền ngoại tệ là VND", () => {
    const product = parseTikTokProductPayload(
      {
        code: 0,
        data: {
          products: [
            {
              id: "1",
              title: "X",
              sale_price: { amount: "20", currency: "USD" },
            },
          ],
        },
      },
      "1",
    );
    expect(product?.priceVnd).toBeUndefined();
  });

  it("tách product id từ link TikTok Shop", () => {
    expect(
      parseTikTokProductId(
        "https://shop.tiktok.com/view/product/1729501987168522656?region=VN",
      ),
    ).toBe("1729501987168522656");
    expect(parseTikTokProductId("https://www.tiktok.com/@abc/video/1")).toBeNull();
  });

  it("lookup dùng endpoint 202509 và product_ids trong query", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            products: [
              {
                id: "1729501987168522656",
                title: "Đèn LED",
                sale_price: { amount: "89000", currency: "VND" },
              },
            ],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const product = await fetchTikTokAffiliateProduct(
      openApiConfig(),
      "1729501987168522656",
      fetcher,
    );
    expect(product?.productName).toBe("Đèn LED");
    const endpoint = new URL(capturedUrl);
    expect(endpoint.pathname).toBe(
      "/affiliate_creator/202509/open_collaborations/products",
    );
    expect(endpoint.searchParams.get("product_ids")).toBe(
      "1729501987168522656",
    );
    expect(capturedBody).toBe("{}");
  });

  it("tạo sharing link qua endpoint Creator 202505", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    const fetcher = (async (url: unknown, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            sharing_links: [
              {
                material_id: "1729501987168522656",
                sharing_link: "https://shop.tiktok.com/view/product/1729501987168522656?affiliate=1",
              },
            ],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const link = await generateTikTokAffiliateSharingLink(
      { ...openApiConfig(), TIKTOK_AFFILIATE_CAMPAIGN_ID: "campaign-1" },
      { productId: "1729501987168522656", campaignId: "campaign-1" },
      fetcher,
    );
    expect(link).toContain("shop.tiktok.com/view/product/");
    expect(new URL(capturedUrl).pathname).toBe(
      "/affiliate_creator/202505/affiliate_sharing_links/general_publishers/generate_batch",
    );
    expect(capturedBody).toMatchObject({
      material: { ids: ["1729501987168522656"], type: "PRODUCT" },
      campaign_id: "campaign-1",
    });
  });

  it("đọc được tên field affiliate_sharing_links của API/partner cũ", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            affiliate_sharing_links: [
              {
                affiliate_sharing_link:
                  "https://www.tiktok.com/t/ZSExample123/",
              },
            ],
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    expect(
      await generateTikTokAffiliateSharingLink(
        openApiConfig(),
        { productId: "1729501987168522656" },
        fetcher,
      ),
    ).toBe("https://www.tiktok.com/t/ZSExample123/");
  });

  it("từ chối sharing link trả về domain giả", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: { sharing_links: [{ link: "https://tiktok.com.evil.test/x" }] },
        }),
        { status: 200 },
      )) as typeof fetch;
    expect(
      await generateTikTokAffiliateSharingLink(
        openApiConfig(),
        { productId: "1" },
        fetcher,
      ),
    ).toBeNull();
  });

  it("không gọi mạng khi thiếu credential hoặc product id sai", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    expect(
      await fetchTikTokAffiliateProduct(testConfig(), "99", fetcher),
    ).toBeNull();
    expect(
      await generateTikTokAffiliateSharingLink(
        openApiConfig(),
        { productId: "khong-hop-le" },
        fetcher,
      ),
    ).toBeNull();
    expect(called).toBe(false);
  });
});
