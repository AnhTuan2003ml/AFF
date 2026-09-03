import * as WebBrowser from 'expo-web-browser';

import { apiBaseUrl } from '@/api/client';

/**
 * Mở một trang pháp lý trên web (Điều khoản, Quyền riêng tư, Chính sách người
 * dùng) trong trình duyệt hệ thống, ĐÚNG ngôn ngữ đang chọn của app: đi qua
 * /lang/<lang> để đặt cookie rồi mới vào trang (WebBrowser không mang cookie
 * của web nên phải đặt lại). Nội dung do web dựng — luôn là bản mới nhất.
 */
export function moTrangPhapLy(path: string, lang: 'vi' | 'en'): void {
  const goc = apiBaseUrl || 'https://shoptikvn.com';
  void WebBrowser.openBrowserAsync(`${goc}/lang/${lang}?next=${path}`).catch(() => {});
}

export const DUONG_DAN_PHAP_LY = {
  dieuKhoan: '/dieu-khoan',
  quyenRiengTu: '/quyen-rieng-tu',
  chinhSachNguoiDung: '/chinh-sach-nguoi-dung',
} as const;
