import { apiFetch } from './client';

/**
 * Tra cứu và mua — ánh xạ với src/routes/api/products.ts.
 *
 * Hai bước tách rời có chủ đích ở backend: `preview` KHÔNG ghi gì vào cơ sở dữ
 * liệu, chỉ giữ kết quả trong bộ nhớ 15 phút và trả về `previewId`. Chỉ khi
 * người dùng bấm mua thì `purchase` mới dựng link Affiliate và ghi bản ghi.
 * Nhờ vậy người chưa đăng nhập vẫn xem trước được tiền hoàn.
 */

export type ProductPlatform = 'SHOPEE' | 'TIKTOK' | 'LAZADA';

export interface ProductPreview {
  /** false = thẻ chỉ dựng từ URL, chưa có dữ liệu thật nào từ sàn. */
  dataVerified: boolean;
  platform: ProductPlatform;
  platformLabel: string;
  normalizedUrl: string;
  productId: string | null;
  shopId: string | null;
  productName: string;
  shopName: string | null;
  imageUrl: string | null;
  priceVnd: number | null;
  /** Giá gốc trước giảm — chỉ khác null khi sàn đang thực sự khuyến mãi. */
  originalPriceVnd: number | null;
  affiliateCommissionVnd: number | null;
  buyerCashbackVnd: number | null;
  buyerCashbackPercent: number;
  commissionRateBps: number | null;
  dataStatus: 'COMPLETE' | 'PARTIAL';
  estimateOnly: true;
}

export interface PreviewResult {
  product: ProductPreview;
  previewId: string;
}

/** Không cần đăng nhập — khách xem trước tiền hoàn được. */
export function traCuu(productUrl: string) {
  return apiFetch<PreviewResult>('/api/v1/products/preview', {
    method: 'POST',
    body: { productUrl },
    auth: false,
  });
}

/** Cần đăng nhập. Trả về buyUrl dạng /go/:clickId. */
export function taoLinkMua(previewId: string) {
  return apiFetch<{ buyUrl: string }>('/api/v1/products/purchase', {
    method: 'POST',
    body: { previewId },
  });
}
