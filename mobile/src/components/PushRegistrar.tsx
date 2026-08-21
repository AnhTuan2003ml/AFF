import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/hooks/useSession';
import { dangKyThongBao } from '@/lib/push';

/**
 * Mount một lần: đăng ký nhận push khi đã đăng nhập, và mở màn Thông báo khi
 * người dùng chạm vào một thông báo đẩy.
 */
export function PushRegistrar() {
  const { user } = useSession();

  useEffect(() => {
    if (user) void dangKyThongBao();
  }, [user]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/notifications');
    });
    return () => sub.remove();
  }, []);

  return null;
}
