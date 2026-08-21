import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MascotFab } from '@/components/MascotFab';
import { colors } from '@/theme/tokens';

/**
 * Thanh tab dưới cùng — dựng lại đúng năm mục của thanh điều hướng web khi mở
 * trên điện thoại (`.px-bottom-nav` trong app-base.njk): Trang chủ, Khám phá,
 * Đơn hàng, Ví, Tài khoản.
 *
 * Thứ tự và nhãn giữ nguyên như web để người dùng chuyển qua lại giữa hai bên
 * không phải học lại. Mục đang mở tô cam, các mục còn lại dùng màu chữ mờ.
 */
export default function TabsLayout() {
  // Máy Android dùng cử chỉ vuốt có thanh gạch ngang chiếm chỗ ở đáy. Cộng
  // thêm phần đó vào chiều cao, nếu không nhãn tab bị thanh gạch đè lên.
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Trang chủ',
          tabBarIcon: ({ color }) => (
            <Ionicons name="search-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Khám phá',
          tabBarIcon: ({ color }) => (
            <Ionicons name="compass-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Đơn hàng',
          tabBarIcon: ({ color }) => (
            <Ionicons name="receipt-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Ví',
          tabBarIcon: ({ color }) => (
            <Ionicons name="wallet-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: 'Điểm danh',
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" size={26} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Tài khoản',
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-circle-outline" size={26} color={color} />
          ),
        }}
      />
    </Tabs>
      <MascotFab />
    </View>
  );
}
