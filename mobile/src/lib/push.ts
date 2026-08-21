import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { dangKyPush } from '@/api/features';

/**
 * Nhận thông báo ngoài app qua Expo Push.
 *
 * QUAN TRỌNG: chỉ cần `import 'expo-notifications'` ở cấp module là nó tự chạy
 * side-effect đăng ký device push token và NÉM LỖI trong Expo Go (SDK 53+ đã bỏ
 * remote push). Vì vậy tuyệt đối KHÔNG import tĩnh — chỉ dynamic import khi đang
 * ở BẢN BUILD thật. Trong Expo Go thì bỏ qua hoàn toàn, app không crash.
 */

function laExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

/** Id kênh thông báo Android — đổi id khi đổi âm thanh/rung (xem ghi chú bên dưới). */
export const CHANNEL_ID = 'shoptik-alerts';

export async function dangKyThongBao(): Promise<void> {
  if (laExpoGo() || !Device.isDevice) return;
  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      // Kênh "gây chú ý": chuông riêng (assets/sounds/shoptik_notify.wav, nhúng
      // qua plugin expo-notifications), rung, đèn màu thương hiệu, nổi heads-up.
      // Android KHÔNG cho đổi âm thanh của kênh đã tạo → mỗi lần đổi cấu hình
      // phải đổi CHANNEL_ID (server push.ts và app.config.js defaultChannel
      // phải dùng cùng id). Kênh `default` cũ bị xoá để không hiện 2 kênh.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Thông báo ShopTik',
        description: 'Đơn hàng, tiền hoàn, nhiệm vụ và rút tiền',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'shoptik_notify.wav',
        vibrationPattern: [0, 260, 140, 260, 140, 420],
        enableVibrate: true,
        enableLights: true,
        lightColor: '#ee4d2d',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        showBadge: true,
      });
      await Notifications.deleteNotificationChannelAsync('default').catch(() => {});
    }

    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (token) await dangKyPush(token);
  } catch (error) {
    // Không đăng ký được — bỏ qua, không chặn app. Nguyên nhân hay gặp trên
    // Android: bản build thiếu google-services.json (FCM) → "Default FirebaseApp
    // is not initialized"; khi đó server không có token và KHÔNG thể đẩy thông
    // báo ra ngoài app. Chỉ cảnh báo ở bản dev để còn thấy mà sửa.
    if (__DEV__) console.warn('[push] Không đăng ký được thông báo đẩy:', error);
  }
}

/** Lắng nghe người dùng chạm vào thông báo đẩy để mở màn tương ứng. */
export async function nghePushTap(onTap: () => void): Promise<() => void> {
  if (laExpoGo()) return () => {};
  try {
    const Notifications = await import('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener(() => onTap());
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
