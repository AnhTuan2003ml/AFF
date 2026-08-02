import { afterEach, describe, expect, it } from "vitest";
import { createPurchaseIntent } from "../src/services/affiliate.js";
import {
  calculateBuyerCashback,
  lookupProductPreview,
  parseLazadaProductIdentity,
  parsePartnerProductPayload,
  parseShopeeProductIdentity,
} from "../src/services/product-preview.js";
import { createTestDb, testConfig } from "./helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("product preview", () => {
  it("đọc đúng shopId và productId từ hai dạng link Shopee phổ biến", () => {
    expect(
      parseShopeeProductIdentity("https://shopee.vn/product/123/456"),
    ).toEqual({ shopId: "123", productId: "456" });
    expect(
      parseShopeeProductIdentity(
        "https://shopee.vn/may-xay-chinh-hang-i.987.654",
      ),
    ).toEqual({ shopId: "987", productId: "654" });
    expect(
      parseShopeeProductIdentity(
        "https://shopee.vn/Robot-Smart-Gadgets-qu%C3%A9t-nh%C3%A0-h%C3%BAt-b%E1%BB%A5i-lau-nh%C3%A0-th%C3%B4ng-minh-M%C3%A1y-H%C3%BAt-B%E1%BB%A5i-robot-mini-%C4%91a-ch%E1%BB%A9c-n%C4%83ng-gi%C3%A1-r%E1%BA%BB-HOT-i.723523606.29951889800",
      ),
    ).toEqual({ shopId: "723523606", productId: "29951889800" });
  });

  it("doc productId va skuId tu link Lazada", () => {
    expect(
      parseLazadaProductIdentity(
        "https://www.lazada.vn/products/pdp-i2383196313-s13314698197.html",
      ),
    ).toEqual({ productId: "2383196313", skuId: "13314698197" });
  });

  it("mở link gốc Lazada mẫu qua HTTP redirect và loại tracking cũ", async () => {
    const shortUrl =
      "https://s.lazada.vn/s.nAoHA?c=c&t=p-i3UWIoC-sGf1QfZ";
    const fullUrl =
      "https://www.lazada.vn/products/may-xay-da-nang-i2581764776-s12584860860.html";
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","name":"Máy xay đa năng","image":["https://laz-cdn.example/may-xay.jpg"],"offers":{"price":"399000"}}
      </script>`;
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === shortUrl) {
        return new Response("", {
          status: 302,
          headers: {
            location: `${fullUrl}?from_affiliate=1&laz_token=old&utm_source=share`,
          },
        });
      }
      if (url === fullUrl) return new Response(html, { status: 200 });
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      testConfig(),
      shortUrl,
      80,
      fetcher,
      "LAZADA",
    );

    expect(product.normalizedUrl).toBe(fullUrl);
    expect(product.productId).toBe("2581764776");
    expect(product.productName).toBe("Máy xay đa năng");
  });

  it("mở link Affiliate Lazada mẫu từ trang chuyển tiếp HTML/JS", async () => {
    const affiliateShare =
      "https://s.lazada.vn/s.nAot2?c=p&t=p-i3UWIoC-sGf1QfZ";
    const fullUrl =
      "https://www.lazada.vn/products/may-xay-da-nang-i2581764776-s12584860860.html";
    const redirectHtml = `<meta http-equiv="refresh" content="0;url=${fullUrl}?from_affiliate=1&amp;laz_token=old">`;
    const productHtml = `
      <script type="application/ld+json">
      {"@type":"Product","name":"Máy xay đa năng","image":["https://laz-cdn.example/may-xay.jpg"],"offers":{"price":"399000"}}
      </script>`;
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === affiliateShare) {
        return new Response(redirectHtml, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url === fullUrl) return new Response(productHtml, { status: 200 });
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      testConfig(),
      affiliateShare,
      80,
      fetcher,
      "LAZADA",
    );

    expect(product.normalizedUrl).toBe(fullUrl);
    expect(product.productId).toBe("2581764776");
  });

  it("chuẩn hóa dữ liệu sản phẩm từ API đối tác", () => {
    expect(
      parsePartnerProductPayload({
        data: {
          productInfo: {
            productName: "Máy xay đa năng",
            shopName: "Gian hàng chính hãng",
            imageUrl: "https://down-vn.img.susercontent.com/file/abc123xyz",
            priceVnd: 1_250_000,
            commissionVnd: 100_000,
            itemId: "456",
            shopId: "123",
          },
        },
      }),
    ).toMatchObject({
      productName: "Máy xay đa năng",
      shopName: "Gian hàng chính hãng",
      priceVnd: 1_250_000,
      affiliateCommissionVnd: 100_000,
      productId: "456",
      shopId: "123",
    });
    expect(
      parsePartnerProductPayload({
        title: "Robot hút bụi",
        price: "177.000 ₫",
      }),
    ).toMatchObject({ priceVnd: 177000 });
  });

  it("tính tiền hoàn 80% từ tổng hoa hồng sàn", () => {
    expect(calculateBuyerCashback(100_000, 80)).toBe(80_000);
    expect(calculateBuyerCashback(null, 80)).toBeNull();
  });

  it("ưu tiên hoa hồng thật từ API đối tác và vẫn ghi là dự kiến", async () => {
    const config = {
      ...testConfig(),
      SHOPEE_PRODUCT_API_URL: "https://products.example.com/lookup",
    };
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://products.example.com")) {
        return new Response(
          JSON.stringify({
            productInfo: {
              productName: "Nồi chiên không dầu",
              imageUrl:
                "https://down-vn.img.susercontent.com/file/product-image-123",
              priceVnd: 2_000_000,
              affiliateCommissionVnd: 150_000,
              productId: "456",
              shopId: "123",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("", { status: 503 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      config,
      "https://shopee.vn/product/123/456",
      80,
      fetcher,
    );
    expect(product.priceVnd).toBe(2_000_000);
    expect(product.affiliateCommissionVnd).toBe(150_000);
    expect(product.buyerCashbackVnd).toBe(120_000);
    expect(product.commissionSource).toBe("PARTNER_API");
    expect(product.estimateOnly).toBe(true);
  });

  it("gọi API product-data kiểu GET item_id và đọc price/commission", async () => {
    const config = {
      ...testConfig(),
      SHOPEE_PRODUCT_API_URL:
        "https://data.addlivetag.com/product-data/product-data.php",
    };
    let capturedUrl = "";
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://data.addlivetag.com/")) {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            status: "success",
            productInfo: {
              itemId: 29951889800,
              productName: "Robot hút bụi mini đa chức năng",
              shopName: "Smart Gadgets",
              price: 122200,
              imageUrl: "https://cf.shopee.vn/file/vn-abc",
              commission: 21996,
              sellerComFinal: 16497,
              shopeeComFinal: 5499,
              dataSource: "db",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 403 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      config,
      "https://shopee.vn/robot-hut-bui-i.723523606.29951889800",
      80,
      fetcher,
    );
    expect(capturedUrl).toContain("item_id=29951889800");
    expect(product.productName).toBe("Robot hút bụi mini đa chức năng");
    expect(product.imageUrl).toBe("https://cf.shopee.vn/file/vn-abc");
    expect(product.priceVnd).toBe(122200);
    expect(product.affiliateCommissionVnd).toBe(21996);
    // Chia 80% hoa hồng cho người mua: floor(21996 × 80%) = 17.596 đ.
    expect(product.buyerCashbackVnd).toBe(17596);
    expect(product.commissionSource).toBe("PARTNER_API");
    expect(product.dataStatus).toBe("COMPLETE");
  });

  it("chỉ ước tính theo tỷ lệ cấu hình khi API không trả hoa hồng", async () => {
    const config = {
      ...testConfig(),
      SHOPEE_DEFAULT_COMMISSION_RATE_BPS: 500,
    };
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://shopee.vn/api/v4/item/get")) {
        return new Response(
          JSON.stringify({
            data: {
              name: "Tai nghe không dây",
              image: "shopee-image-123",
              price: 100_000_000_000,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      config,
      "https://shopee.vn/tai-nghe-i.123.456",
      80,
      fetcher,
    );
    expect(product.priceVnd).toBe(1_000_000);
    expect(product.affiliateCommissionVnd).toBe(50_000);
    expect(product.buyerCashbackVnd).toBe(40_000);
    expect(product.commissionSource).toBe("CONFIGURED_RATE");
  });

  it("đọc giá gốc gạch ngang (price_before_discount) từ API item Shopee", async () => {
    const config = testConfig();
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://shopee.vn/api/v4/item/get")) {
        return new Response(
          JSON.stringify({
            data: {
              name: "Nồi chiên không dầu",
              image: "shopee-image-456",
              price: 68_600 * 100_000,
              price_before_discount: 121_540 * 100_000,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      config,
      "https://shopee.vn/noi-chien-i.123.456",
      80,
      fetcher,
    );
    expect(product.priceVnd).toBe(68_600);
    expect(product.originalPriceVnd).toBe(121_540);
  });

  it("không hiển thị giá gốc khi price_before_discount không cao hơn giá bán", async () => {
    const config = testConfig();
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://shopee.vn/api/v4/item/get")) {
        return new Response(
          JSON.stringify({
            data: {
              name: "Nồi chiên không dầu",
              image: "shopee-image-456",
              price: 121_540 * 100_000,
              price_before_discount: 121_540 * 100_000,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const product = await lookupProductPreview(
      config,
      "https://shopee.vn/noi-chien-i.123.456",
      80,
      fetcher,
    );
    expect(product.priceVnd).toBe(121_540);
    expect(product.originalPriceVnd).toBeNull();
  });

  it("không báo không tìm thấy với link Shopee hợp lệ khi sàn chặn API", async () => {
    const config = testConfig();
    const fetcher = (async () =>
      new Response("", { status: 403 })) as typeof fetch;
    const product = await lookupProductPreview(
      config,
      "https://shopee.vn/Robot-Smart-Gadgets-qu%C3%A9t-nh%C3%A0-h%C3%BAt-b%E1%BB%A5i-lau-nh%C3%A0-th%C3%B4ng-minh-M%C3%A1y-H%C3%BAt-B%E1%BB%A5i-robot-mini-%C4%91a-ch%E1%BB%A9c-n%C4%83ng-gi%C3%A1-r%E1%BA%BB-HOT-i.723523606.29951889800",
      80,
      fetcher,
      "SHOPEE",
    );
    expect(product.productId).toBe("29951889800");
    expect(product.shopId).toBe("723523606");
    expect(product.productName).toMatch(/Robot Smart Gadgets/i);
    expect(product.dataStatus).toBe("PARTIAL");
  });

  it("đọc sản phẩm TikTok Shop qua API tích hợp đa sàn", async () => {
    const config = {
      ...testConfig(),
      TIKTOK_AFFILIATE_ID: "tiktok-aff-01",
      TIKTOK_PRODUCT_API_URL: "https://products.example.com/tiktok",
    };
    const fetcher = (async (input: string | URL | Request) => {
      if (String(input) === config.TIKTOK_PRODUCT_API_URL) {
        return new Response(
          JSON.stringify({
            data: {
              title: "Máy hút bụi cầm tay",
              image: "https://example.com/product.jpg",
              price: 399000,
              commission_vnd: 50000,
              product_id: "1729384756102938475",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const product = await lookupProductPreview(
      config,
      "https://shop.tiktok.com/view/product/1729384756102938475",
      80,
      fetcher,
      "TIKTOK",
    );
    expect(product.platform).toBe("TIKTOK");
    expect(product.priceVnd).toBe(399000);
    expect(product.buyerCashbackVnd).toBe(40000);
    expect(product.dataStatus).toBe("COMPLETE");
  });

  it("đọc giá Lazada từ biến tracking pdpTrackingData khi JSON-LD không có giá", async () => {
    // Trang sản phẩm Lazada thật: JSON-LD chỉ có tên/ảnh (không có offers.price),
    // giá thật nằm trong `var pdpTrackingData = "{...json đã escape...}";`
    // (đã xác minh trực tiếp trên trang thật ngày 2026-07-27).
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","@context":"https://schema.org","name":"Bàn phím cơ RGB","image":["https://laz-cdn.example/kb.jpg"],"offers":{"@type":"Offer","availability":"https://schema.org/InStock"}}
      </script>
      <script>
      var timings = { start: Date.now() };
      var pdpTrackingData = "{\\"pdt_name\\":\\"Bàn phím cơ RGB\\",\\"pdt_price\\":\\"459.000 ₫\\",\\"pdt_sku\\":123}";
      </script>
    `;
    const config = testConfig();
    const fetcher = (async (input: string | URL | Request) => {
      if (String(input).includes("lazada.vn")) {
        return new Response(html, { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const product = await lookupProductPreview(
      config,
      "https://www.lazada.vn/products/pdp-i2383196313-s13314698197.html",
      80,
      fetcher,
      "LAZADA",
    );
    expect(product.platform).toBe("LAZADA");
    expect(product.productName).toBe("Bàn phím cơ RGB");
    expect(product.priceVnd).toBe(459000);
    expect(product.imageUrl).toBe("https://laz-cdn.example/kb.jpg");
  });

  it("uu tien gia displayPrice trong priceCompare cua link Lazada", async () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","@context":"https://schema.org","name":"May mai pin","image":["https://laz-cdn.example/grinder.jpg"],"offers":{"@type":"Offer","availability":"https://schema.org/InStock"}}
      </script>
      <script>
      var pdpTrackingData = "{\\"pdt_name\\":\\"May mai pin\\",\\"pdt_price\\":\\"121.540 ₫\\",\\"pdt_sku\\":123}";
      </script>
    `;
    const config = testConfig();
    const fetcher = (async (input: string | URL | Request) => {
      if (String(input).includes("lazada.vn")) {
        return new Response(html, { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const product = await lookupProductPreview(
      config,
      "https://www.lazada.vn/products/pdp-i2383196313-s13314698197.html?priceCompare=skuId%3A13314698197%3BoriginPrice%3A68600%3BdisplayPrice%3A68600",
      80,
      fetcher,
      "LAZADA",
    );

    expect(product.productId).toBe("2383196313");
    expect(product.priceVnd).toBe(68600);
    expect(product.originalPriceVnd).toBe(121540);
  });

  it("doc gia goc Lazada tu du lieu nhung trong trang", async () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Product","@context":"https://schema.org","name":"May mai pin","image":["https://laz-cdn.example/grinder.jpg"],"offers":{"@type":"Offer","availability":"https://schema.org/InStock"}}
      </script>
      <script>
      var pdpTrackingData = "{\\"pdt_name\\":\\"May mai pin\\",\\"pdt_price\\":\\"68.600 ₫\\",\\"pdt_sku\\":123}";
      window.__moduleData__ = {"data":{"originalPrice":"121.540 ₫","price":"68.600 ₫"}};
      </script>
    `;
    const config = testConfig();
    const fetcher = (async (input: string | URL | Request) => {
      if (String(input).includes("lazada.vn")) {
        return new Response(html, { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;
    const product = await lookupProductPreview(
      config,
      "https://www.lazada.vn/products/pdp-i2383196313-s13314698197.html",
      80,
      fetcher,
      "LAZADA",
    );

    expect(product.priceVnd).toBe(68600);
    expect(product.originalPriceVnd).toBe(121540);
  });
});

describe("instant purchase intent", () => {
  it("lưu ảnh chụp sản phẩm và tạo URL mua không lộ user id", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email, full_name, status, role, referral_code)
       VALUES ('buyer-preview@example.com', 'Buyer Preview', 'ACTIVE', 'USER', 'PREVIEW1')
       RETURNING id`,
    );
    const userId = user.rows[0]!.id;
    const config = testConfig();

    const purchase = await createPurchaseIntent(db, config, {
      userId,
      productUrl: "https://shopee.vn/product/123/456",
      cashbackRateBps: 8000,
      source: "app",
      campaign: "instantbuy",
      product: {
        platform: "SHOPEE",
        productId: "456",
        shopId: "123",
        productName: "Máy xay đa năng",
        shopName: "Shop chính hãng",
        imageUrl:
          "https://down-vn.img.susercontent.com/file/product-image-123",
        priceVnd: 1_250_000,
        originalPriceVnd: 1_500_000,
        affiliateCommissionVnd: 100_000,
        buyerCashbackVnd: 80_000,
        buyerCashbackPercent: 80,
        commissionSource: "PARTNER_API",
      },
    });

    expect(purchase.buyUrl).toBe(
      `http://localhost:3000/go/${purchase.clickId}`,
    );
    expect(purchase.subId).not.toContain(userId.replaceAll("-", ""));

    const snapshot = await db.query<{
      product_name: string;
      product_price_vnd: string;
      product_original_price_vnd: string;
      estimated_cashback_vnd: string;
      buyer_cashback_percent: number;
      campaign: string;
    }>(
      `SELECT product_name, product_price_vnd::text,
         product_original_price_vnd::text,
         estimated_cashback_vnd::text, buyer_cashback_percent, campaign
       FROM affiliate_links WHERE click_id = $1`,
      [purchase.clickId],
    );
    expect(snapshot.rows[0]).toEqual({
      product_name: "Máy xay đa năng",
      product_price_vnd: "1250000",
      product_original_price_vnd: "1500000",
      estimated_cashback_vnd: "80000",
      buyer_cashback_percent: 80,
      campaign: "instantbuy",
    });
  });

  it("tạo và lưu link mua TikTok Shop từ API Affiliate", async () => {
    const { db, close } = await createTestDb();
    cleanup = close;
    const user = await db.query<{ id: string }>(
      `INSERT INTO users (email, full_name, status, role, referral_code)
       VALUES ('buyer-tiktok@example.com', 'Buyer TikTok', 'ACTIVE', 'USER', 'TIKTOK01')
       RETURNING id`,
    );
    const config = {
      ...testConfig(),
      TIKTOK_AFFILIATE_ID: "tiktok-aff-01",
      TIKTOK_PRODUCT_API_URL: "https://products.example.com/tiktok",
    };
    const fetcher = (async () =>
      new Response(
        JSON.stringify({ affiliateUrl: "https://vt.tiktok.com/ZSaff123/" }),
        { status: 200 },
      )) as typeof fetch;

    const purchase = await createPurchaseIntent(
      db,
      config,
      {
        userId: user.rows[0]!.id,
        productUrl:
          "https://shop.tiktok.com/view/product/1729384756102938475",
        cashbackRateBps: 8000,
        source: "app",
        campaign: "instantbuy",
        product: {
          platform: "TIKTOK",
          productId: "1729384756102938475",
          shopId: null,
          productName: "Máy hút bụi cầm tay",
          shopName: "Tik Shop",
          imageUrl: "https://example.com/product.jpg",
          priceVnd: 399000,
          affiliateCommissionVnd: 50000,
          buyerCashbackVnd: 40000,
          buyerCashbackPercent: 80,
          commissionSource: "PARTNER_API",
        },
      },
      fetcher,
    );

    expect(purchase.platform).toBe("TIKTOK");
    const stored = await db.query<{
      platform: string;
      affiliate_url: string;
    }>(
      "SELECT platform, affiliate_url FROM affiliate_links WHERE click_id = $1",
      [purchase.clickId],
    );
    expect(stored.rows[0]).toEqual({
      platform: "TIKTOK",
      affiliate_url: "https://vt.tiktok.com/ZSaff123/",
    });
  });
});
