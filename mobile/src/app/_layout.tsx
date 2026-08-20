import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

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

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
