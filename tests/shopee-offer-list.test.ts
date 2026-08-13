import { describe, expect, it } from "vitest";
import {
  commissionRateToBps,
  normalizeShopeeOffer,
  parseShopeeOfferList,
} from "../src/services/shopee-offer-list.js";

// Rút gọn từ response thật affiliate.shopee.vn/api/v3/offer/product/list.
const OFFER_WITH_DISCOUNT = {
  item_id: "27022333952",
  product_link: "https://shopee.vn/product/773428813/27022333952",
  long_link: "https://shopee.vn/universal-link/product/773428813/27022333952?x=1",
  seller_commission_rate: "10%",
  default_commission_rate: "17%",
  max_commission_rate: "0%",
  batch_item_for_item_card_full: {
    itemid: "27022333952",
    shopid: "773428813",
    name: "Túi Cói Đay tự nhiên BST Net Việt",
    image: "sg-11134201-7ra19-m59petjcz49kcd",
    images: ["sg-11134201-7ra19-m59petjcz49kcd", "vn-11134207-7ras8-m4hlogo2is5jb2"],
    stock: 324,
    sold: 28,
    historical_sold: 263,
    catid: 100016,
    brand: "",
    price: "10290000000",
    price_before_discount: "10500000000",
    raw_discount: 2,
    item_rating: { rating_count: [39, 2, 0, 3, 0, 34], rating_star: 4.641025641 },
    is_official_shop: false,
    is_preferred_plus_seller: false,
    is_on_flash_sale: false,
    shop_name: "Trương Gia Túi Vải",
    shop_rating: 4.790304,
  },
};

const OFFER_FLASH_SALE = {
  item_id: "29416666887",
  product_link: "https://shopee.vn/product/1053077389/29416666887",
  long_link: "",
  seller_commission_rate: "8%",
  default_commission_rate: "11%",
  max_commission_rate: "0%",
  batch_item_for_item_card_full: {
    itemid: "29416666887",
    shopid: "1053077389",
    name: "GOOJODOQ Quạt gấp 3 trong 1 Màn hình LED",
    image: "cn-11134207-7ras8-m8e7salrxoyacd",
    images: [],
    stock: 201,
    sold: 9000,
    historical_sold: 300000,
    catid: 100013,
    price: "25900000000",
    price_before_discount: "32000000000",
    raw_discount: 28,
    item_rating: { rating_count: [74183], rating_star: 4.8736 },
    is_official_shop: true,
    is_preferred_plus_seller: false,
    is_on_flash_sale: true,
    shop_name: "Goojodoq Offical Shop.VN",
    shop_rating: 4.822518,
  },
};

describe("commissionRateToBps", () => {
  it('"17%" → 1700 bps', () => expect(commissionRateToBps("17%")).toBe(1700));
  it('"8%" → 800 bps', () => expect(commissionRateToBps("8%")).toBe(800));
  it('"0%"/rỗng → null', () => {
    expect(commissionRateToBps("0%")).toBeNull();
    expect(commissionRateToBps("")).toBeNull();
    expect(commissionRateToBps(null)).toBeNull();
  });
});

describe("normalizeShopeeOffer", () => {
  it("quy đổi giá, giảm giá và hoa hồng", () => {
    const item = normalizeShopeeOffer(OFFER_WITH_DISCOUNT)!;
    expect(item).toMatchObject({
      itemId: "27022333952",
      shopId: "773428813",
      name: "Túi Cói Đay tự nhiên BST Net Việt",
      priceVnd: 102_900,
      originalPriceVnd: 105_000,
      discountPercent: 2,
      soldCount: 28,
      historicalSold: 263,
      ratingCount: 39,
      stock: 324,
      categoryId: "100016",
      shopName: "Trương Gia Túi Vải",
      isOnFlashSale: false,
      sellerCommissionBps: 1000,
      defaultCommissionBps: 1700,
      maxCommissionBps: null,
    });
    expect(item.ratingStar).toBeCloseTo(4.64, 2);
    expect(item.imageUrl).toContain("down-vn.img.susercontent.com/file/");
    expect(item.affiliateUrl).toContain("universal-link");
  });

  it("nhận cờ flash sale và shop chính hãng", () => {
    const item = normalizeShopeeOffer(OFFER_FLASH_SALE)!;
    expect(item.isOnFlashSale).toBe(true);
    expect(item.isOfficialShop).toBe(true);
    expect(item.discountPercent).toBe(28);
    expect(item.defaultCommissionBps).toBe(1100);
    expect(item.affiliateUrl).toBeNull();
  });

  it("thiếu định danh cốt lõi → null", () => {
    expect(normalizeShopeeOffer({})).toBeNull();
    expect(normalizeShopeeOffer({ batch_item_for_item_card_full: {} })).toBeNull();
  });
});

describe("parseShopeeOfferList", () => {
  it("nhận nguyên payload {code,msg,data:{list}} và khử trùng", () => {
    const payload = {
      code: 0,
      msg: "success",
      data: { list: [OFFER_WITH_DISCOUNT, OFFER_FLASH_SALE, OFFER_WITH_DISCOUNT] },
    };
    const items = parseShopeeOfferList(payload);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.itemId)).toEqual(["27022333952", "29416666887"]);
  });

  it("nhận trực tiếp mảng list", () => {
    expect(parseShopeeOfferList([OFFER_WITH_DISCOUNT])).toHaveLength(1);
  });

  it("payload rỗng/không hợp lệ → []", () => {
    expect(parseShopeeOfferList(null)).toEqual([]);
    expect(parseShopeeOfferList({ data: {} })).toEqual([]);
  });
});
