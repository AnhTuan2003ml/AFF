import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Appearance } from 'react-native';

import { SessionProvider } from '@/hooks/useSession';
import { LanguageProvider } from '@/i18n';
import { colors, isDarkTheme } from '@/theme/tokens';

/*
 * Tạo QueryClient MỘT lần ở tầng module, không phải trong component.
 * Đặt trong component thì mỗi lần render lại sinh client mới, cache đổ hết —
 * đúng thứ react-query sinh ra để tránh.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dữ liệu ví và đơn hàng đổi theo lượt đồng bộ ở server, không đổi từng
      // giây. Giữ 30 giây để chuyển qua lại giữa các tab không gọi lại API.
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

/*
 * Theme đi THEO MÁY, giống web: web đã có bảng tối (`public/luxury-dark.css`)
 * và tự chọn theo prefers-color-scheme, app cũng vậy — `tokens.ts` đọc chế độ
 * của máy một lần lúc mở app và xuất đúng bảng màu (sáng/tối espresso ấm).
 */
const theme = {
  ...(isDarkTheme ? DarkTheme : DefaultTheme),
  colors: {
    ...(isDarkTheme ? DarkTheme.colors : DefaultTheme.colors),
    background: colors.paper,
    card: colors.surface,
    text: colors.text,
    border: colors.line,
    primary: colors.brand,
  },
};

export default function RootLayout() {
  // Bảng màu cố định từ lúc mở app (mọi màn import `colors` tĩnh). Máy đổi
  // sáng↔tối giữa chừng thì nạp lại bundle để chọn lại bảng — sự kiện hiếm,
  // đổi theme cả hệ thống nên người dùng không thấy đường đột.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      if ((colorScheme === 'dark') !== isDarkTheme) {
        Updates.reloadAsync().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* SessionProvider nằm TRONG QueryClientProvider vì nó gọi
          useQueryClient() để xoá cache lúc đăng xuất. */}
      <SessionProvider>
        <LanguageProvider>
        <ThemeProvider value={theme}>
          <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            {/* Đăng nhập trượt lên từ đáy như một tờ giấy, không đẩy tab đi. */}
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="register" options={{ presentation: 'modal' }} />
            <Stack.Screen name="forgot-password" options={{ presentation: 'modal' }} />
            <Stack.Screen name="bank" options={{ presentation: 'modal' }} />
            <Stack.Screen name="withdraw" options={{ presentation: 'modal' }} />
            <Stack.Screen name="missions" options={{ presentation: 'modal' }} />
            <Stack.Screen name="referrals" options={{ presentation: 'modal' }} />
            <Stack.Screen name="support" options={{ presentation: 'modal' }} />
            <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
            <Stack.Screen name="kol" options={{ presentation: 'modal' }} />
            {/* Thông báo = popup đè lên màn đang mở (nền dưới vẫn thấy, mờ đi). */}
            <Stack.Screen
              name="notifications"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
            <Stack.Screen name="disclaimer" options={{ presentation: 'modal' }} />
            <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
            <Stack.Screen name="account-review" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
        </LanguageProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
