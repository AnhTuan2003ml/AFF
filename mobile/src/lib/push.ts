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
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo ShopTik',
        importance: Notifications.AndroidImportance.HIGH,
      });
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
  } catch {
    // Không đăng ký được (Expo Go / lỗi quyền) — bỏ qua, không chặn app.
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
