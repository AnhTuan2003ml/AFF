import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProductPreview } from '@/api/products';
import { useT } from '@/i18n';
import { vnd } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Thẻ kết quả tra cứu — bản dựng lại của khối xem trước bên web.
 *
 * Quy tắc quan trọng giữ nguyên từ web: KHÔNG bịa số tiền hoàn. Khi sàn chưa
 * trả hoa hồng (`buyerCashbackVnd` null) thì hiện "Đang cập nhật" chứ không
 * hiện 0đ — người dùng thấy 0đ sẽ tưởng sản phẩm không được hoàn, còn thấy một
 * con số bịa thì mất niềm tin khi tiền về không khớp.
 */
export function PreviewCard({
  product,
  dangMua,
  onMua,
  daDangNhap,
}: {
  product: ProductPreview;
  dangMua: boolean;
  onMua: () => void;
  daDangNhap: boolean;
}) {
  const t = useT();
  const coHoan = product.buyerCashbackVnd !== null && product.buyerCashbackVnd > 0;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Ionicons name="image-outline" size={22} color={colors.muted} />
          </View>
        )}

        <View style={styles.info}>
          <View style={styles.platformPill}>
            <Text style={styles.platformText}>{product.platformLabel}</Text>
          </View>
          <Text style={styles.name} numberOfLines={3}>
            {product.productName}
          </Text>
          {product.priceVnd !== null ? (
            <View style={styles.priceRow}>
              <Text style={styles.price}>{vnd(product.priceVnd)}</Text>
              {product.originalPriceVnd !== null && (
                <Text style={styles.priceOld}>{vnd(product.originalPriceVnd)}</Text>
              )}
            </View>
          ) : (
            <Text style={styles.priceUnknown}>{t('Chưa lấy được giá', 'Price unavailable')}</Text>
          )}
        </View>
      </View>

      <View style={styles.cashbackBox}>
        <Text style={styles.cashbackLabel}>{t('Tiền hoàn dự kiến', 'Estimated cashback')}</Text>
        <Text style={[styles.cashbackValue, !coHoan && styles.cashbackPending]}>
          {coHoan ? vnd(product.buyerCashbackVnd) : t('Đang cập nhật', 'Updating')}
        </Text>
      </View>

      {!product.dataVerified && (
        <Text style={styles.warn}>
          {t(
            'Sàn chưa trả dữ liệu cho sản phẩm này — thông tin trên thẻ dựng từ đường dẫn, số tiền hoàn có thể đổi sau khi đơn được ghi nhận.',
            'The store has not returned data for this product — the details shown are built from the link, and the cashback amount may change after the order is recorded.',
          )}
        </Text>
      )}

      <Pressable
        onPress={onMua}
        disabled={dangMua}
        style={({ pressed }) => [
          styles.buyBtn,
          dangMua && { opacity: 0.6 },
          pressed && !dangMua && { backgroundColor: colors.brandStrong },
        ]}>
        {dangMua ? (
          <ActivityIndicator color={colors.onBrand} />
        ) : (
          <Text style={styles.buyText}>
            {daDangNhap ? t('Mua ngay  →', 'Buy now  →') : t('Đăng nhập để mua', 'Sign in to buy')}
          </Text>
        )}
      </Pressable>

      <Text style={styles.note}>
        {t(
          'Bấm Mua ngay sẽ mở sàn bằng trình duyệt hệ thống để giữ mã theo dõi đơn.',
          'Tapping Buy now opens the store in your system browser to keep the order tracking code.',
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  top: { flexDirection: 'row', gap: 12 },
  thumb: { width: 84, height: 84, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 4 },
  platformPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  platformText: { fontSize: 10.5, fontWeight: '900', color: colors.brand, letterSpacing: 0.4 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 19 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 16, fontWeight: '900', color: colors.brand },
  priceOld: {
    fontSize: 12.5,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  priceUnknown: { fontSize: 12.5, color: colors.muted },

  cashbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
  },
  cashbackLabel: { fontSize: 13, fontWeight: '700', color: colors.inkSoft },
  cashbackValue: { fontSize: 20, fontWeight: '900', color: colors.success },
  cashbackPending: { fontSize: 14, color: colors.muted },

  warn: { fontSize: 11.5, color: colors.muted, lineHeight: 17, marginTop: 10 },

  buyBtn: {
    marginTop: spacing.md,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },
  note: { fontSize: 11, color: colors.muted, marginTop: 8, textAlign: 'center' },
});
