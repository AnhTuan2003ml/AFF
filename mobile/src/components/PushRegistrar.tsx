import { router } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/hooks/useSession';
import { dangKyThongBao, nghePushTap } from '@/lib/push';

/**
 * Mount một lần: đăng ký nhận push khi đã đăng nhập, và mở màn Thông báo khi
 * người dùng chạm vào một thông báo đẩy. Trong Expo Go, lib/push tự bỏ qua.
 */
export function PushRegistrar() {
  const { user } = useSession();

  useEffect(() => {
    if (user) void dangKyThongBao();
  }, [user]);

  useEffect(() => {
    let cleanup = () => {};
    // Phản hồi CSKH → mở thẳng màn Hỗ trợ; còn lại → danh sách Thông báo.
    void nghePushTap((data) =>
      router.push(data.type === 'SUPPORT_REPLY' ? '/support' : '/notifications'),
    ).then((c) => {
      cleanup = c;
    });
    return () => cleanup();
  }, []);

  return null;
}
