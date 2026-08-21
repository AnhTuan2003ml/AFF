import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { BrandHeader } from '@/components/BrandHeader';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Khung tạm cho bốn tab chưa dựng. Có mặt để thanh tab đủ năm mục ngay từ bây
 * giờ — thiếu mục thì không kiểm tra được điều hướng, mà điều hướng là thứ dễ
 * vỡ nhất khi thêm màn hình về sau.
 */
export function ComingSoon({ icon, title, note }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  note: string;
}) {
  return (
    <View style={styles.screen}>
      <BrandHeader />
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={28} color={colors.brand} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 10 },
  iconWrap: {
    width: 64, height: 64, borderRadius: radius.lg,
    backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  note: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
