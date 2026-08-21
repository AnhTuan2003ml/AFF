import * as WebBrowser from 'expo-web-browser';

import { apiBaseUrl } from '@/api/client';
import { taoLinkMua, traCuu } from '@/api/products';

/**
 * Chuyển đổi link sản phẩm → mở luồng mua có hoàn tiền, dùng chung cho mọi thẻ
 * sản phẩm (băng Trang chủ, Khám phá, Sản phẩm bạn quan tâm).
 *
 * Đúng luồng web: preview (tra cứu) → purchase (tạo link Affiliate) → mở
 * `/go/:clickId` bằng trình duyệt hệ thống. BẮT BUỘC dùng trình duyệt hệ thống
 * (không WebView) để bàn giao đúng sang app sàn và giữ nguyên Sub ID quy kết.
 */
export async function moLinkMua(productUrl: string): Promise<void> {
  const kq = await traCuu(productUrl);
  const { buyUrl } = await taoLinkMua(kq.previewId);
  // buyUrl đã là URL tuyệt đối (${APP_ORIGIN}/go/:clickId) — chỉ prepend khi
  // lỡ là đường dẫn tương đối, tránh nối đôi domain.
  await WebBrowser.openBrowserAsync(
    buyUrl.startsWith('http') ? buyUrl : `${apiBaseUrl}${buyUrl}`,
  );
}
