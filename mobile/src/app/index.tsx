import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiBaseUrl, pingServer } from '@/api/client';
import { darkColors, lightColors, radius, spacing } from '@/theme/tokens';

/**
 * Màn hình kiểm chứng của Giai đoạn 0.
 *
 * Nó chưa làm gì cho người dùng, và đúng ra là như vậy. Việc của nó là trả lời
 * một câu hỏi: chuỗi Windows → cloud Expo → điện thoại có thông không, và điện
 * thoại có gọi được tới backend không. Trả lời xong thì Giai đoạn 2 thay nó
 * bằng màn hình Trang chủ thật.
 */
export default function HomeScreen() {
  const colors = useColorScheme() === 'dark' ? darkColors : lightColors;

  const { data: online, isPending } = useQuery({
    queryKey: ['server-health'],
    queryFn: pingServer,
    retry: false,
  });

  const status = isPending
    ? { label: 'Đang kiểm tra kết nối…', color: colors.muted, soft: colors.surfaceMuted }
    : online
      ? { label: 'Đã kết nối máy chủ', color: colors.success, soft: colors.successSoft }
      : { label: 'Chưa kết nối được máy chủ', color: colors.danger, soft: colors.dangerSoft };

  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.badge, { backgroundColor: colors.brand }]}>
          <Text style={[styles.badgeText, { color: colors.onBrand }]}>ST</Text>
        </View>

        <Text style={[styles.title, { color: colors.brand }]}>ShopTik</Text>
        <Text style={[styles.subtitle, { color: colors.inkSoft }]}>
          Hoàn tiền khi mua sắm trên Shopee, TikTok Shop và Lazada
        </Text>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <View style={[styles.statusPill, { backgroundColor: status.soft }]}>
            {isPending ? (
              <ActivityIndicator size="small" color={status.color} />
            ) : (
              <View style={[styles.dot, { backgroundColor: status.color }]} />
            )}
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.muted }]}>Máy chủ</Text>
            <Text style={[styles.rowValue, { color: colors.text }]} numberOfLines={1}>
              {apiBaseUrl || 'chưa cấu hình'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: colors.muted }]}>Giai đoạn</Text>
            <Text style={[styles.rowValue, { color: colors.text }]}>
              0 — thông chuỗi công cụ
            </Text>
          </View>
        </View>

        <Text style={[styles.footnote, { color: colors.muted }]}>
          Màn hình này sẽ được thay bằng Trang chủ thật ở giai đoạn 2.
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 28, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  card: {
    alignSelf: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    marginBottom: spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
});
