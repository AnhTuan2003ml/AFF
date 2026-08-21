import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/hooks/useSession';
import { colors } from '@/theme/tokens';

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
 * Khoá giao diện sáng. Web (`public/luxury-ui.css`) đặt cứng
 * `color-scheme: light` và không có bảng màu tối, nên để app đi theo chế độ của
 * máy sẽ khiến app và web lệch hẳn nhau ngay khi người dùng bật chế độ tối.
 */
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.paper,
    card: colors.surface,
    text: colors.text,
    border: colors.line,
    primary: colors.brand,
  },
};

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* SessionProvider nằm TRONG QueryClientProvider vì nó gọi
          useQueryClient() để xoá cache lúc đăng xuất. */}
      <SessionProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="dark" />
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
            <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
