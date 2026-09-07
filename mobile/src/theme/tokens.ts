/**
 * Bảng màu ShopTik cho app di động — SÁNG và TỐI, tự theo máy.
 *
 * Nguồn thật là web ở repo gốc:
 *   - bảng SÁNG dịch từ `public/luxury-ui.css` (token --lx-*),
 *   - bảng TỐI dịch từ `public/luxury-dark.css` (khối :root[data-theme="dark"]).
 * Đổi màu thì sửa hai file CSS đó trước rồi đồng bộ sang đây.
 *
 * Quy ước màu, giữ đúng như web đang chạy:
 *   brand   cam  — nhận diện, nút chính, mọi hành động chính
 *   success xanh lá — trạng thái tốt, tiền đã về ví
 *   danger  đỏ gạch — lỗi, đơn hủy, đăng xuất
 *   accent  champagne — huy hiệu, nhấn nhẹ
 *
 * CÁCH CHỌN BẢNG: đọc chế độ sáng/tối của MÁY một lần lúc nạp module
 * (Appearance.getColorScheme) — mọi màn import `colors` tĩnh nên bảng màu cố
 * định trong suốt phiên chạy. Máy đổi chế độ giữa chừng thì _layout.tsx nghe
 * sự kiện và reload bundle để chọn lại (xem RootLayout). app.json phải để
 * `userInterfaceStyle: "automatic"` thì iOS mới báo đúng chế độ.
 */

import { Appearance } from 'react-native';

export interface ShopTikColors {
  /** Nền trang. */
  paper: string;
  /** Nền thẻ nổi trên `paper`. */
  surface: string;
  /** Nền chìm: ô nhập, vùng phụ. */
  surfaceMuted: string;
  line: string;
  lineStrong: string;
  text: string;
  inkSoft: string;
  muted: string;
  /** Cam thương hiệu. */
  brand: string;
  /** Đầu sáng của dải cam — dùng cho gradient nút và chữ thương hiệu. */
  brand2: string;
  /** Cam đậm hơn cho trạng thái nhấn giữ. */
  brandStrong: string;
  brandSoft: string;
  brandLine: string;
  onBrand: string;
  accent: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  /** Nền nâu của chân trang và dải số liệu dưới hero. */
  inverse: string;
  inverseText: string;
  inverseMuted: string;
}

export const lightColors: ShopTikColors = {
  paper: '#fbf8f4',
  surface: '#fffdfa',
  surfaceMuted: '#f5efe8',
  line: '#e9ded4',
  lineStrong: '#d7c8bc',
  text: '#2b211c',
  inkSoft: '#4d4038',
  muted: '#81736a',
  brand: '#ee4d2d',
  brand2: '#ff6b35',
  brandStrong: '#d8431f',
  brandSoft: '#fff0e9',
  brandLine: '#f7d9cc',
  onBrand: '#ffffff',
  accent: '#c99b5d',
  success: '#23865f',
  successSoft: '#e9f5f0',
  danger: '#c83d37',
  dangerSoft: '#fdecea',
  warning: '#c99b5d',
  warningSoft: '#fdf5e9',
  inverse: '#43271c',
  inverseText: '#ffffff',
  inverseMuted: '#cdb8ac',
};

/** Tông "espresso ấm" — khớp luxury-dark.css: giữ nhận diện cam + nâu. */
export const darkColors: ShopTikColors = {
  paper: '#16110e',
  surface: '#211a15',
  surfaceMuted: '#2c231c',
  line: '#3b3026',
  lineStrong: '#4f4134',
  text: '#f2e9e1',
  inkSoft: '#d5c8bd',
  muted: '#a5968a',
  brand: '#ff6a3d',
  brand2: '#ff8a5f',
  brandStrong: '#e85427',
  brandSoft: 'rgba(255, 106, 61, 0.16)',
  brandLine: 'rgba(255, 106, 61, 0.30)',
  onBrand: '#ffffff',
  accent: '#d8ab6c',
  success: '#3cb883',
  successSoft: 'rgba(60, 184, 131, 0.14)',
  danger: '#ff7a70',
  dangerSoft: 'rgba(255, 122, 112, 0.14)',
  warning: '#d8ab6c',
  warningSoft: 'rgba(216, 171, 108, 0.16)',
  inverse: '#2b1a12',
  inverseText: '#ffffff',
  inverseMuted: '#cdb8ac',
};

/** Chế độ tối của máy tại thời điểm mở app — cố định cho cả phiên chạy. */
export const isDarkTheme = Appearance.getColorScheme() === 'dark';

export const colors: ShopTikColors = isDarkTheme ? darkColors : lightColors;

/** Bo góc, lấy từ --lx-radius và --lx-radius-lg. */
export const radius = { sm: 12, md: 18, lg: 28, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/**
 * Đổ bóng của web (--lx-shadow-soft) dịch sang thuộc tính React Native.
 * Bản tối bóng phải đậm và đen hơn mới thấy trên nền tối (như luxury-dark).
 */
export const shadow = {
  card: isDarkTheme
    ? {
        shadowColor: '#000000',
        shadowOpacity: 0.38,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      }
    : {
        shadowColor: '#4d3122',
        shadowOpacity: 0.07,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 10 },
        elevation: 3,
      },
} as const;

/**
 * THANG CHỮ CHUẨN (form chữ cố định) — nguồn DUY NHẤT cho cỡ/độ đậm/giãn chữ
 * toàn app. Trước đây mỗi màn tự đặt inline nên tiêu đề nhảy 25–32, h2 nhảy
 * 13–19, weight lẫn 800/900. Dùng preset ở đây để mọi màn đồng nhất.
 *
 * Hướng tinh chỉnh (học từ ShopBack/Rakuten): đậm VỪA (800, không 900 khối),
 * giãn dòng thoáng, ít cỡ. Số liệu lớn (tiền/mốc) giữ 900 để nổi bật.
 *
 * Cách dùng:  <Text style={[typography.screenTitle, { color: colors.text }]}>…</Text>
 * (preset đã có color mặc định — lấy từ bảng màu đã chọn theo máy.)
 */
export const typography = {
  /** Tiêu đề màn hình (h1). */
  screenTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  /** Số liệu lớn: số dư, mốc, tổng. Giữ 900 cho nổi bật. */
  statValue: { fontSize: 30, fontWeight: '900', letterSpacing: -1, color: colors.text },
  /** Tiêu đề mục / thẻ lớn (h2). */
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, color: colors.text },
  /** Tiêu đề thẻ nhỏ / dòng danh sách. */
  cardTitle: { fontSize: 14.5, fontWeight: '800', letterSpacing: -0.1, color: colors.text },
  /** Nhãn nhỏ IN HOA phía trên tiêu đề (eyebrow). */
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.muted },
  /** Nhãn trường form. */
  label: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0, color: colors.inkSoft },
  /** Nội dung chính. */
  body: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.inkSoft },
  /** Nội dung phụ / mô tả dài. */
  bodyMuted: { fontSize: 13.5, fontWeight: '400', lineHeight: 20, color: colors.muted },
  /** Meta / thời gian / gợi ý nhỏ. */
  small: { fontSize: 11.5, fontWeight: '600', color: colors.muted },
} as const;

/**
 * Bộ ba màu cho dải mờ dần ở mép danh sách cuộn ngang (LinearGradient).
 *
 * Phải theo bảng màu đang dùng: bản cũ đóng cứng rgba(251,248,244,…) — đúng
 * nền sáng, nhưng ở chế độ tối nó thành một vệt trắng đục vắt ngang.
 */
export const paperFadeGradient: readonly [string, string, string] = isDarkTheme
  ? ['rgba(22,17,14,0)', 'rgba(22,17,14,0.9)', '#16110e']
  : ['rgba(251,248,244,0)', 'rgba(251,248,244,0.9)', '#fbf8f4'];

/** Nền kính mờ của nút tròn nhỏ nổi trên nội dung (mũi tên "còn nữa"). */
export const surfaceGlass = isDarkTheme
  ? 'rgba(33,26,21,0.82)'
  : 'rgba(255,253,250,0.72)';
