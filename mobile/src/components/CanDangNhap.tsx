import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Màn chắn cho các tab chỉ xem được khi đã đăng nhập (Đơn hàng, Ví, Tài khoản).
 *
 * Không đá người dùng về màn đăng nhập ngay khi bấm vào tab: web cũng để họ
 * nhìn thấy tab tồn tại rồi mới mời đăng nhập. Đá thẳng khiến người mới không
 * hiểu app có những gì.
 */
export function CanDangNhap({ mo_ta }: { mo_ta: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Ionicons name="lock-closed-outline" size={26} color={colors.brand} />
      </View>
      <Text style={styles.title}>Cần đăng nhập</Text>
      <Text style={styles.note}>{mo_ta}</Text>
      <Pressable
        onPress={() => router.push('/login')}
        style={({ pressed }) => [styles.btn, pressed && { backgroundColor: colors.brandStrong }]}>
        <Text style={styles.btnText}>Đăng nhập</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 10 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  btn: {
    marginTop: 8,
    height: 46,
    paddingHorizontal: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: colors.onBrand, fontWeight: '800', fontSize: 14.5 },
});
