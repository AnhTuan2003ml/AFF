import { describe, expect, it } from "vitest";
import {
  buildLazadaAffiliateUrl,
  buildShopeeAffiliateUrl,
  buildSubIdParts,
  isPlatformPurchaseEnabled,
  isSafeAffiliateRedirect,
  resolveProductUrl,
} from "../src/services/affiliate.js";
import { testConfig } from "./helpers.js";

describe("Affiliate link safety", () => {
  it("chỉ nhận đúng hostname Shopee và loại tracking thừa", () => {
    const result = resolveProductUrl(
      "https://shopee.vn/product/123/456?utm_source=facebook&sp_atk=secret&color=red#reviews",
    );
    expect(result.platform).toBe("SHOPEE");
    expect(result.normalizedUrl).toContain("color=red");
    expect(result.normalizedUrl).not.toContain("utm_source");
    expect(result.normalizedUrl).not.toContain("sp_atk");
    expect(result.normalizedUrl).not.toContain("#reviews");
  });

  it("nhận diện đúng TikTok Shop và Lazada Việt Nam", () => {
    expect(
      resolveProductUrl(
        "https://shop.tiktok.com/view/product/1729384756102938475?utm_source=share",
      ).platform,
    ).toBe("TIKTOK");
    expect(
      resolveProductUrl(
        "https://www.lazada.vn/products/may-hut-bui-i28900123-s30112244.html?spm=abc",
      ).platform,
    ).toBe("LAZADA");
  });


  it("giữ nguyên token của hai link chia sẻ Lazada mẫu để resolver mở đúng đích", () => {
    const originalShare =
      "https://s.lazada.vn/s.nAoHA?c=c&t=p-i3UWIoC-sGf1QfZ";
    const affiliateShare =
      "https://s.lazada.vn/s.nAot2?c=p&t=p-i3UWIoC-sGf1QfZ";

    expect(resolveProductUrl(originalShare, "LAZADA").normalizedUrl).toBe(
      originalShare,
    );
    expect(resolveProductUrl(affiliateShare, "LAZADA").normalizedUrl).toBe(
      affiliateShare,
    );
  });

  it("nhận link rút gọn Shopee shp.ee và vn.shp.ee", () => {
    expect(
      resolveProductUrl("https://vn.shp.ee/k8N4NTqY").platform,
    ).toBe("SHOPEE");
    expect(resolveProductUrl("https://shp.ee/abcdef").platform).toBe("SHOPEE");
  });

  it("báo rõ khi sàn người dùng chọn không khớp với link", () => {
    expect(() =>
      resolveProductUrl(
        "https://www.lazada.vn/products/may-hut-bui-i28900123-s30112244.html",
        "SHOPEE",
      ),
    ).toThrow(/Lazada/);
  });

  it.each([
    "https://shopee.vn.evil.example/product/1/2",
    "http://shopee.vn/product/1/2",
    "https://user:pass@shopee.vn/product/1/2",
    "https://example.com/?next=shopee.vn",
  ])("từ chối URL không an toàn: %s", (url) => {
    expect(() => resolveProductUrl(url)).toThrow();
  });

  it("không bọc lại một link Affiliate có sẵn", () => {
    expect(() =>
      resolveProductUrl(
        "https://s.shopee.vn/an_redir?origin_link=https%3A%2F%2Fshopee.vn",
      ),
    ).toThrow();
  });

  it("tạo sub_id có user, click, nguồn và chiến dịch", () => {
    const result = buildShopeeAffiliateUrl({
      productUrl: "https://shopee.vn/product/123/456",
      affiliateId: "14354840000",
      clickId: "abcDEF_123",
      source: "youtube",
      campaign: "video-01",
    });
    const parsed = new URL(result.affiliateUrl);
    expect(parsed.hostname).toBe("s.shopee.vn");
    expect(parsed.searchParams.get("affiliate_id")).toBe("14354840000");
    expect(parsed.searchParams.get("origin_link")).toBe(
      "https://shopee.vn/product/123/456",
    );
    expect(result.subId).toMatch(/^cabcDEF_123-youtube-video01$/);
    expect(result.subId).not.toContain("0f1df62e");
    expect(isSafeAffiliateRedirect(result.affiliateUrl)).toBe(true);
    expect(
      isSafeAffiliateRedirect("https://s.shopee.vn.evil.example/an_redir"),
    ).toBe(false);
  });
});


describe("Sub ID mang mã người mua và mã sản phẩm", () => {
  it("ghép đúng thứ tự c/u/p rồi tới nguồn và chiến dịch", () => {
    expect(
      buildSubIdParts({
        clickId: "abcDEF_123",
        userCode: "9f2c71a04b8d",
        productId: "43508358436",
        source: "app",
        campaign: "instantbuy",
      }),
    ).toEqual([
      "cabcDEF_123",
      "u9f2c71a04b8d",
      "p43508358436",
      "app",
      "instantbuy",
    ]);
  });

  it("bỏ qua mảnh thiếu thay vì chèn chỗ trống gây lệch thứ tự", () => {
    expect(
      buildSubIdParts({ clickId: "click01", source: "web", campaign: "direct" }),
    ).toEqual(["cclick01", "web", "direct"]);
    expect(
      buildSubIdParts({
        clickId: "click01",
        userCode: "abc123456789",
        productId: null,
      }),
    ).toEqual(["cclick01", "uabc123456789", "web", "direct"]);
  });

  it("loại ký tự sàn không chấp nhận khỏi từng mảnh", () => {
    expect(
      buildSubIdParts({
        clickId: "aB-cD_eF",
        userCode: "9f2c71a04b8d",
        productId: "435-083",
        source: "app store",
        campaign: "instant/buy",
      }),
    ).toEqual([
      "caBcD_eF",
      "u9f2c71a04b8d",
      "p435083",
      "appstore",
      "instantbuy",
    ]);
  });

  it("Sub ID Shopee là các mảnh nối bằng dấu gạch ngang", () => {
    const result = buildShopeeAffiliateUrl({
      productUrl: "https://shopee.vn/product/123/456",
      affiliateId: "14354840000",
      clickId: "click01",
      userCode: "9f2c71a04b8d",
      productId: "43508358436",
      source: "app",
      campaign: "instantbuy",
    });
    expect(result.subId).toBe(
      "cclick01-u9f2c71a04b8d-p43508358436-app-instantbuy",
    );
  });
});

describe("Lazada Affiliate Master Link", () => {
  it("tạo link theo Master Link chính thức và loại tracking cũ", () => {
    const config = {
      ...testConfig(),
      LAZADA_AFFILIATE_ID: "publisher-internal-id",
      LAZADA_AFFILIATE_MASTER_LINK: "https://c.lazada.vn/t/c.AbC123",
    };
    expect(isPlatformPurchaseEnabled(config, "LAZADA")).toBe(true);
    const result = buildLazadaAffiliateUrl(config, {
      productUrl:
        "https://www.lazada.vn/products/loa-bluetooth-i28900123-s30112244.html?from_affiliate=1&laz_token=old&utm_source=facebook",
      clickId: "click_123",
      source: "facebook",
      campaign: "video-01",
    });
    const url = new URL(result.affiliateUrl);
    expect(url.origin + url.pathname).toBe("https://c.lazada.vn/t/c.AbC123");
    expect(url.searchParams.get("url")).toBe(
      "https://www.lazada.vn/products/loa-bluetooth-i28900123-s30112244.html",
    );
    expect(url.searchParams.get("sub_id1")).toBe("cclick_123");
    expect(url.searchParams.get("sub_id2")).toBe("facebook");
    expect(url.searchParams.get("sub_id3")).toBe("video01");
    expect(isSafeAffiliateRedirect(result.affiliateUrl, "LAZADA", config)).toBe(true);
  });

  it("không suy đoán Master Link từ mã $...$ hoặc link chia sẻ s.lazada.vn", () => {
    expect(
      isPlatformPurchaseEnabled(
        { ...testConfig(), LAZADA_AFFILIATE_ID: "$c7g5x$" },
        "LAZADA",
      ),
    ).toBe(false);
    expect(
      isPlatformPurchaseEnabled(
        {
          ...testConfig(),
          LAZADA_AFFILIATE_ID:
            "https://s.lazada.vn/s.nAot2?c=p&t=p-i3UWIoC-sGf1QfZ",
        },
        "LAZADA",
      ),
    ).toBe(false);
  });

  it("tương thích khi LAZADA_AFFILIATE_ID đã là Master Link thật", () => {
    expect(
      isPlatformPurchaseEnabled(
        { ...testConfig(), LAZADA_AFFILIATE_ID: "c.001QjP" },
        "LAZADA",
      ),
    ).toBe(true);
  });
});
