import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Me } from '@/api/account';
import { vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Ba ô số liệu chân hero — `.px-home-hero-meta` của web ĐỔI NỘI DUNG theo trạng
 * thái đăng nhập: khách thấy lời giới thiệu, người đã đăng nhập thấy số dư thật.
 */
const SO_LIEU_KHACH = [
  { chinh: '3 sàn', phu: 'Shopee · TikTok · Lazada' },
  { chinh: 'Hoàn tới 80%', phu: 'Về ví minh bạch' },
  { chinh: 'Miễn phí', phu: 'Không phí ẩn' },
];

function soLieu(me?: Me | null) {
  if (!me) return SO_LIEU_KHACH;
  return [
    { chinh: vnd(me.balances.available), phu: 'Số dư khả dụng' },
    { chinh: vnd(me.balances.pending), phu: 'Đang chờ về ví' },
    {
      chinh: `Hoàn tới ${me.cashbackPercent ?? 0}%`,
      phu: `Đã mua ${me.purchasedProducts ?? 0} sản phẩm`,
    },
  ];
}

/**
 * Khối hero của Trang chủ — bản dựng lại của `.px-home-hero`.
 *
 * Web phủ ảnh bằng gradient ngang (cam đậm bên trái nhạt dần sang phải), nhưng
 * ở khổ điện thoại nó đổi sang gradient DỌC: cam đậm dưới đáy, nhạt dần lên
 * trên (xem `@media(max-width:820px)` trong luxury-ui.css). App chạy toàn ở
 * khổ hẹp nên chỉ dựng bản dọc.
 */
export function HomeHero({ onCheck, me }: { onCheck?: () => void; me?: Me | null }) {
  const SO_LIEU = soLieu(me);
  return (
    <View style={styles.hero}>
      <Image
        source={require('../../assets/images/hero.webp')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        // Web neo ảnh ở 68% chiều ngang để giữ chiếc điện thoại trong khung.
        contentPosition={{ left: '68%', top: '50%' }}
      />
      <LinearGradient
        colors={['rgba(44,28,22,0.08)', 'rgba(238,77,45,0.50)', 'rgba(184,54,29,0.98)']}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>SHOP · TRACK · CASHBACK</Text>
        <Text style={styles.title}>Mua sắm thông minh.{'\n'}Hoàn tiền tối ưu.</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onCheck}
            style={({ pressed }) => [styles.btnLight, pressed && { opacity: 0.85 }]}>
            <Text style={styles.btnLightText}>Kiểm tra hoàn tiền</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Text style={styles.linkLight}>Khám phá sản phẩm  →</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.meta}>
        {/* key theo NHÃN (không theo giá trị): hai ô cùng "0đ" từng trùng key. */}
        {SO_LIEU.map((o, i) => (
          <View key={o.phu ?? i} style={[styles.metaCell, i > 0 && styles.metaDivider]}>
            <Text style={styles.metaMain} numberOfLines={1}>
              {o.chinh}
            </Text>
            <Text style={styles.metaSub} numberOfLines={1}>
              {o.phu}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.inverse,
  },
  copy: { paddingHorizontal: 20, paddingTop: 74, paddingBottom: 20 },
  eyebrow: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  title: {
    color: '#fff',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 },
  btnLight: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  btnLightText: { color: colors.text, fontWeight: '800', fontSize: 13.5 },
  linkLight: { color: '#fff', fontWeight: '800', fontSize: 13.5 },

  meta: {
    flexDirection: 'row',
    backgroundColor: 'rgba(40,22,14,0.55)',
    paddingVertical: 12,
  },
  metaCell: { flex: 1, paddingHorizontal: 12 },
  metaDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.22)',
  },
  metaMain: { color: '#fff', fontWeight: '800', fontSize: 13 },
  metaSub: { color: 'rgba(255,255,255,0.72)', fontSize: 10.5, marginTop: 2 },
});
