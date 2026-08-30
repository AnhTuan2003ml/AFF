/**
 * Bảng màu ShopTik cho app di động.
 *
 * Nguồn thật là `public/luxury-ui.css` ở repo gốc — file DUY NHẤT mà trang
 * `/app` nạp, tức là thứ người dùng thật sự nhìn thấy. Trước đây file này dịch
 * từ `public/theme/tokens.css` (hệ navy), nhưng CSS đó chỉ được backoffice nạp,
 * nên app và web đã trôi thành hai bộ nhận diện khác nhau: app xanh dương, web
 * cam. Đổi màu thì sửa `luxury-ui.css` trước rồi đồng bộ sang đây.
 *
 * Quy ước màu, giữ đúng như web đang chạy:
 *   brand   cam  — nhận diện, nút chính, mọi hành động chính
 *   success xanh lá — trạng thái tốt, tiền đã về ví
 *   danger  đỏ gạch — lỗi, đơn hủy, đăng xuất
 *   accent  champagne — huy hiệu, nhấn nhẹ
 *
 * Chỉ có MỘT bảng màu vì web không có chế độ tối: `luxury-ui.css` đặt cứng
 * `color-scheme: light`. App theo hệ thống sẽ lệch khỏi web ngay khi máy bật
 * chế độ tối, nên app cũng khoá sáng (`userInterfaceStyle: "light"` ở app.json).
 */

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

export const colors: ShopTikColors = {
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

/**
 * Giữ hai tên cũ để phần mã còn lại không gãy khi chuyển sang một bảng màu duy
 * nhất. Cả hai trỏ về cùng một bảng — app không có chế độ tối.
 */
export const lightColors = colors;
export const darkColors = colors;

/** Bo góc, lấy từ --lx-radius và --lx-radius-lg. */
export const radius = { sm: 12, md: 18, lg: 28, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Đổ bóng của web (--lx-shadow-soft) dịch sang thuộc tính React Native. */
export const shadow = {
  card: {
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
 * (preset đã có color mặc định; ghi đè khi cần.)
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
