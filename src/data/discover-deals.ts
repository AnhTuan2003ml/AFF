export interface DiscoverDeal {
  id: string;
  platform: string;
  platformName: string;
  title: string;
  shopName: string;
  image: string;
  originalPrice: number | null;
  salePrice: number | null;
  cashbackRate: number | null;
  cashbackAmount: number | null;
  voucherCode: string | null;
  rating: number | null;
  soldCount: string;
  tag: string;
  category: string;
  productUrl: string;
}
