/**
 * Bảng màu ShopTik cho app di động.
 *
 * Đây là bản dịch 1-1 của lớp semantic trong `public/theme/tokens.css` ở repo
 * gốc — KHÔNG phải một hệ màu mới. App và web phải nhìn ra cùng một thương
 * hiệu, nên khi đổi màu thì sửa file CSS kia trước rồi đồng bộ sang đây.
 *
 * Quy ước màu giữ nguyên như web:
 *   brand   navy  — nhận diện, điều hướng, nút chính
 *   cta     xanh lá — TIỀN và hành động ra tiền (Mua ngay, Rút tiền)
 *   warning hổ phách — điểm thưởng, cảnh báo nhẹ
 *   danger  đỏ — lỗi và hủy
 *   Cam KHÔNG còn là màu thương hiệu, chỉ dùng cho nhận diện sàn Shopee.
 */

export interface ShopTikColors {
  paper: string;
  surface: string;
  surfaceMuted: string;
  line: string;
  lineStrong: string;
  text: string;
  inkSoft: string;
  muted: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandLine: string;
  onBrand: string;
  accent: string;
  cta: string;
  ctaHover: string;
  onCta: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  /** Nhận diện sàn — chỗ duy nhất còn dùng cam. */
  shopee: string;
}

export const lightColors: ShopTikColors = {
  paper: '#f0f4f8',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  line: '#e2e8f0',
  lineStrong: '#cbd5e1',
  text: '#0f172a',
  inkSoft: '#334155',
  muted: '#64748b',
  brand: '#002d9c',
  brandStrong: '#001859',
  brandSoft: '#eff6ff',
  brandLine: '#bfdbfe',
  onBrand: '#ffffff',
  accent: '#0069e0',
  cta: '#009668',
  ctaHover: '#00825a',
  onCta: '#ffffff',
  success: '#047857',
  successSoft: '#ecfdf5',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  warning: '#a16207',
  warningSoft: '#fffbeb',
  shopee: '#ee4d2d',
};

export const darkColors: ShopTikColors = {
  paper: '#070c18',
  surface: '#0f1a30',
  surfaceMuted: '#16233c',
  line: '#24354f',
  lineStrong: '#35496a',
  text: '#eaf1ff',
  inkSoft: '#c4d3ea',
  muted: '#8fa3c0',
  brand: '#5b93f6',
  brandStrong: '#9dc0ff',
  brandSoft: 'rgba(91, 147, 246, 0.14)',
  brandLine: 'rgba(91, 147, 246, 0.30)',
  onBrand: '#06122a',
  accent: '#57b6ff',
  cta: '#17b483',
  ctaHover: '#34d19c',
  onCta: '#04201a',
  success: '#49d39b',
  successSoft: 'rgba(52, 195, 143, 0.10)',
  danger: '#ff7d92',
  dangerSoft: 'rgba(255, 125, 146, 0.10)',
  warning: '#dfb869',
  warningSoft: 'rgba(223, 184, 105, 0.10)',
  shopee: '#ff6b4a',
};

/** Bo góc và khoảng cách — cũng lấy từ tokens.css để khớp cảm giác với web. */
export const radius = { sm: 12, md: 16, lg: 24 } as const;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
