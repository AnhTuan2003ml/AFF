import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { dangKyPush } from '@/api/features';

/**
 * Nhận thông báo ngoài app qua Expo Push. Khi đang mở app vẫn hiện banner.
 *
 * Lưu ý: lấy Expo push token chỉ hoạt động trên BẢN BUILD thật (dev/production);
 * trong Expo Go (SDK 53+) sẽ ném lỗi — ta nuốt lỗi để không làm phiền người dùng.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function dangKyThongBao(): Promise<void> {
  try {
    if (!Device.isDevice) return;

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
    // Expo Go không hỗ trợ push từ xa — bản build thật mới chạy.
  }
}
