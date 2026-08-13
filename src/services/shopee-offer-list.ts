import { shopeeAmountToVnd } from "./shopee-report.js";

/**
 * Parse danh sách "Sản phẩm ưu đãi" (offer/product/list). CHỈ parse, không tự
 * gọi API: endpoint bị anti-bot chặn từ server (error 90309999, token x-sap-sec
 * do JS trình duyệt sinh — cookie đúng vẫn không đủ), nên JSON do trình duyệt
 * admin lấy rồi đẩy vào. Giá nhân sẵn 100.000; tỷ lệ hoa hồng dạng chuỗi "17%".
 */

const IMAGE_BASE = "https://down-vn.img.susercontent.com/file/";

export interface ShopeeOfferItem {
  itemId: string;
  shopId: string;
  name: string;
  imageUrl: string | null;
  images: string[];
  productUrl: string;
  /** Link affiliate đã gắn tracking do Shopee trả sẵn (nếu có). */
  affiliateUrl: string | null;

  priceVnd: number | null;
  originalPriceVnd: number | null;
  discountPercent: number | null;

  soldCount: number | null;
  historicalSold: number | null;

  ratingStar: number | null;
  ratingCount: number | null;

  stock: number | null;
  categoryId: string | null;
  brand: string | null;

  shopName: string | null;
  shopRating: number | null;
  isOfficialShop: boolean;
  isPreferredPlus: boolean;
  isOnFlashSale: boolean;

  /** Hoa hồng người bán trả (bps, 1700 = 17%). */
  sellerCommissionBps: number | null;
  /** Hoa hồng mặc định hiển thị (bps). */
  defaultCommissionBps: number | null;
  /** Hoa hồng tối đa (bps). */
  maxCommissionBps: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveVnd(value: unknown): number | null {
  const vnd = shopeeAmountToVnd(value);
  return vnd > 0 ? vnd : null;
}

/** "17%" → 1700 bps; "0%"/""/null → null. */
export function commissionRateToBps(value: unknown): number | null {
  const raw = stringOf(value).replace("%", "").trim();
  if (!raw) return null;
  const percent = Number(raw);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return Math.round(percent * 100);
}

function imageUrl(code: unknown): string | null {
  const value = stringOf(code);
  return value ? `${IMAGE_BASE}${value}` : null;
}

/** rating_count là mảng [tổng, 1★, 2★, 3★, 4★, 5★] — phần tử đầu là tổng. */
function ratingCountOf(itemRating: Record<string, unknown> | null): number | null {
  const counts = itemRating?.rating_count;
  if (!Array.isArray(counts) || counts.length === 0) return null;
  const total = numberOrNull(counts[0]);
  return total !== null && total >= 0 ? Math.floor(total) : null;
}

/** Chuẩn hóa MỘT phần tử offer. Trả null nếu thiếu định danh cốt lõi. */
export function normalizeShopeeOffer(raw: unknown): ShopeeOfferItem | null {
  const offer = asRecord(raw);
  if (!offer) return null;
  const card = asRecord(offer.batch_item_for_item_card_full);
  if (!card) return null;

  const itemId = stringOf(card.itemid) || stringOf(offer.item_id);
  const shopId = stringOf(card.shopid);
  const name = stringOf(card.name);
  if (!itemId || !shopId || !name) return null;

  const priceVnd = positiveVnd(card.price) ?? positiveVnd(card.price_min);
  const beforeVnd = positiveVnd(card.price_before_discount);
  const originalPriceVnd =
    beforeVnd !== null && priceVnd !== null && beforeVnd > priceVnd
      ? beforeVnd
      : null;
  const rawDiscount = numberOrNull(card.raw_discount);
  const discountPercent =
    rawDiscount !== null && rawDiscount > 0
      ? Math.round(rawDiscount)
      : originalPriceVnd !== null && priceVnd !== null
        ? Math.round((1 - priceVnd / originalPriceVnd) * 100)
        : null;

  const images = Array.isArray(card.images)
    ? card.images
        .map((code) => imageUrl(code))
        .filter((url): url is string => url !== null)
    : [];

  const itemRating = asRecord(card.item_rating);
  const ratingStar = numberOrNull(itemRating?.rating_star);

  const soldCount = numberOrNull(card.sold);
  const historicalSold = numberOrNull(card.historical_sold);
  const stock = numberOrNull(card.stock);
  const shopRating = numberOrNull(card.shop_rating);

  return {
    itemId,
    shopId,
    name,
    imageUrl: imageUrl(card.image) ?? images[0] ?? null,
    images,
    productUrl:
      stringOf(offer.product_link) ||
      `https://shopee.vn/product/${shopId}/${itemId}`,
    affiliateUrl: stringOf(offer.long_link) || null,

    priceVnd,
    originalPriceVnd,
    discountPercent,

    soldCount: soldCount !== null && soldCount >= 0 ? soldCount : null,
    historicalSold:
      historicalSold !== null && historicalSold >= 0 ? historicalSold : null,

    ratingStar:
      ratingStar !== null ? Math.round(ratingStar * 100) / 100 : null,
    ratingCount: ratingCountOf(itemRating),

    stock: stock !== null && stock >= 0 ? stock : null,
    categoryId: card.catid != null ? stringOf(card.catid) || null : null,
    brand: stringOf(card.brand) || null,

    shopName: stringOf(card.shop_name) || null,
    shopRating: shopRating,
    isOfficialShop: card.is_official_shop === true,
    isPreferredPlus: card.is_preferred_plus_seller === true,
    isOnFlashSale: card.is_on_flash_sale === true,

    sellerCommissionBps: commissionRateToBps(offer.seller_commission_rate),
    defaultCommissionBps: commissionRateToBps(offer.default_commission_rate),
    maxCommissionBps: commissionRateToBps(offer.max_commission_rate),
  };
}

// Nhận payload {code, msg, data:{list}} hoặc mảng list; bỏ qua phần tử hỏng
// để một item lệch schema không phá cả mẻ.
export function parseShopeeOfferList(payload: unknown): ShopeeOfferItem[] {
  const root = asRecord(payload);
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.data && asRecord(root?.data)?.list)
      ? (asRecord(root?.data)!.list as unknown[])
      : [];
  const seen = new Set<string>();
  const items: ShopeeOfferItem[] = [];
  for (const raw of list) {
    const item = normalizeShopeeOffer(raw);
    if (!item || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    items.push(item);
  }
  return items;
}
