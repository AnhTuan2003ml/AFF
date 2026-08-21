import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Me } from '@/api/account';
import { layKhamPha, type DiscoverProduct } from '@/api/features';
import { vnd } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/* ==================== Dải quảng bá 3 sàn ==================== */

const SAN = [
  { ma: 'SHOPEE', ten: 'Shopee', mo: 'Dán link Shopee, ShopTik tự nhận diện và kiểm tra hoàn tiền.' },
  { ma: 'TIKTOK', ten: 'TikTok Shop', mo: 'Từ video đến giỏ hàng — link được xử lý tự động trong cùng một luồng.' },
  { ma: 'LAZADA', ten: 'Lazada', mo: 'Tra cứu sản phẩm và khoản hoàn dự kiến mà không cần đổi chế độ.' },
];

/**
 * Dải quảng bá ba sàn — bản dựng lại của `.lux-platform-showcase`.
 *
 * Đây là khu QUẢNG BÁ, không phải bộ chọn: app tự nhận diện sàn từ link được
 * dán nên người dùng không cần chọn thủ công. Ba vạch bên phải bấm được để
 * chuyển, giống hệt web sau lần sửa gần đây.
 */
export function PlatformShowcase() {
  const [i, setI] = useState(0);
  const tamDung = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() < tamDung.current) return;
      setI((v) => (v + 1) % SAN.length);
    }, 4200);
    return () => clearInterval(t);
  }, []);

  const s = SAN[i];
  return (
    <View style={ss.showcase}>
      <View style={ss.showcaseLogo}>
        <Text style={ss.showcaseLogoText}>{s.ten.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ss.showcaseTag}>✓ ĐÃ HỖ TRỢ</Text>
        <Text style={ss.showcaseName}>{s.ten}</Text>
        <Text style={ss.showcaseDesc}>{s.mo}</Text>
      </View>
      <View style={ss.dots}>
        {SAN.map((x, k) => (
          <Pressable
            key={x.ma}
            hitSlop={12}
            onPress={() => {
              // Hoãn vòng tự chạy, nếu không slide tự đổi ngay sau cú bấm.
              tamDung.current = Date.now() + 9000;
              setI(k);
            }}
            style={[ss.dot, k === i && ss.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

/* ==================== Thẻ ví (đã đăng nhập) ==================== */

/** Dựng lại `.mb-points` của web: số dư, chip %, đang chờ, tiến độ tới mức rút. */
export function WalletPanel({ me }: { me: Me }) {
  const toiThieu = me.minWithdrawalVnd ?? 0;
  const conThieu = Math.max(0, toiThieu - me.balances.available);
  const phanTram = toiThieu > 0 ? Math.min(100, Math.round((me.balances.available / toiThieu) * 100)) : 100;

  return (
    <View style={ss.wallet}>
      <View style={ss.walletTop}>
        <View>
          <Text style={ss.walletLabel}>Số dư khả dụng</Text>
          <Text style={ss.walletValue}>{vnd(me.balances.available)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={ss.chip}>
            <Text style={ss.chipText}>Hoàn tới {me.cashbackPercent ?? 0}%</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/orders')}>
            <Text style={ss.pending}>Đang chờ: {vnd(me.balances.pending)} ›</Text>
          </Pressable>
        </View>
      </View>

      <View style={ss.walletBar}>
        <View>
          <Text style={ss.walletBarLabel}>Đã mua qua ShopTik</Text>
          <Text style={ss.walletBarValue}>{me.purchasedProducts ?? 0} sản phẩm</Text>
        </View>
        <View style={ss.walletActions}>
          <Pressable onPress={() => router.push('/(tabs)/wallet')} style={ss.ghost}>
            <Text style={ss.ghostText}>Xem ví</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/withdraw')} style={ss.primary}>
            <Text style={ss.primaryText}>Rút tiền ›</Text>
          </Pressable>
        </View>
      </View>

      {conThieu > 0 && (
        <View style={ss.progressWrap}>
          <Text style={ss.progressCopy}>
            Thêm <Text style={ss.bold}>{vnd(conThieu)}</Text> nữa là đủ mức rút tối thiểu{' '}
            <Text style={ss.bold}>{vnd(toiThieu)}</Text>.
          </Text>
          <View style={ss.progressBar}>
            <View style={[ss.progressFill, { width: `${phanTram}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

/* ==================== Điểm danh & cảnh báo ngân hàng ==================== */

export function CheckinEntry() {
  return (
    <Pressable
      onPress={() => router.push('/checkin')}
      style={({ pressed }) => [ss.entry, pressed && { opacity: 0.85 }]}>
      <View style={ss.entryIcon}>
        <Ionicons name="calendar-outline" size={19} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ss.entryTitle}>Điểm danh mỗi ngày</Text>
        <Text style={ss.entryDesc}>Điểm danh nhận thưởng — đừng để mất chuỗi</Text>
      </View>
      <View style={ss.entryBtn}>
        <Text style={ss.entryBtnText}>Điểm danh</Text>
      </View>
    </Pressable>
  );
}

export function BankAlert() {
  return (
    <Pressable
      onPress={() => router.push('/bank')}
      style={({ pressed }) => [ss.alert, pressed && { opacity: 0.85 }]}>
      <View style={ss.alertIcon}>
        <Ionicons name="card-outline" size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ss.alertTitle}>Hoàn tất tài khoản nhận tiền.</Text>
        <Text style={ss.alertDesc}>
          Thêm và xác minh ngân hàng để có thể rút tiền hoàn khi đủ điều kiện.
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.brand} />
    </Pressable>
  );
}

/* ==================== Băng sản phẩm ==================== */

/** Dựng lại `.promo-carousel` — cuộn ngang, mỗi thẻ một sản phẩm. */
export function ProductStrip({
  tieuDe,
  list,
}: {
  tieuDe: string;
  list: 'best' | 'recommend' | 'exclusive';
}) {
  const { data } = useQuery({
    queryKey: ['discover', list],
    queryFn: () => layKhamPha(list, 1),
  });

  const sp = data?.data ?? [];
  if (sp.length === 0) return null;

  return (
    <View style={ss.strip}>
      <Text style={ss.stripTitle}>{tieuDe}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ss.stripRow}>
        {sp.slice(0, 12).map((p) => (
          <TheSP key={p.item_id} p={p} />
        ))}
      </ScrollView>
    </View>
  );
}

function TheSP({ p }: { p: DiscoverProduct }) {
  const gia = p.price_vnd ? Number(p.price_vnd) : null;
  const hoan =
    gia !== null && p.commission_rate_bps
      ? Math.floor((gia * p.commission_rate_bps) / 10000)
      : null;
  return (
    <View style={ss.spCard}>
      {p.image_url ? (
        <Image source={{ uri: p.image_url }} style={ss.spImg} contentFit="cover" />
      ) : (
        <View style={[ss.spImg, { alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="image-outline" size={20} color={colors.muted} />
        </View>
      )}
      <View style={{ padding: 9, gap: 3 }}>
        <Text style={ss.spName} numberOfLines={2}>
          {p.name}
        </Text>
        <Text style={ss.spPrice}>{gia !== null ? vnd(gia) : 'Đang cập nhật'}</Text>
        {hoan !== null && <Text style={ss.spCash}>Hoàn tới {vnd(hoan)}</Text>}
      </View>
    </View>
  );
}

/* ==================== Chân trang ==================== */

export function AppFooter() {
  return (
    <View style={ss.footer}>
      <View style={ss.footerBrand}>
        <Image
          source={require('../../assets/images/brand-logo.png')}
          style={{ width: 34, height: 34 }}
          contentFit="contain"
        />
        <Text style={ss.footerBrandText}>ShopTik</Text>
      </View>
      <Text style={ss.footerCopy}>
        Một trải nghiệm mua sắm gọn hơn: kiểm tra hoàn tiền, mua qua liên kết và
        theo dõi ví minh bạch.
      </Text>
      <View style={ss.footerLine} />
      <View style={ss.footerBottom}>
        <Text style={ss.footerSmall}>© 2026 ShopTik</Text>
        <Text style={ss.footerSmall}>Shopee · TikTok Shop · Lazada</Text>
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  showcase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
  },
  showcaseLogo: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseLogoText: { fontSize: 20, fontWeight: '900', color: colors.brand },
  showcaseTag: { fontSize: 10.5, fontWeight: '900', color: colors.success, letterSpacing: 0.6 },
  showcaseName: { fontSize: 19, fontWeight: '900', color: colors.brand, marginTop: 2 },
  showcaseDesc: { fontSize: 11.5, color: colors.inkSoft, marginTop: 3, lineHeight: 16 },
  dots: { flexDirection: 'row', gap: 5, alignSelf: 'flex-end' },
  dot: { width: 16, height: 3, borderRadius: 2, backgroundColor: 'rgba(75,49,38,0.18)' },
  dotActive: { backgroundColor: colors.brand },

  wallet: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  walletLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  walletValue: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -1.4, marginTop: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 11, fontWeight: '900', color: colors.brand },
  pending: { fontSize: 11.5, color: colors.inkSoft, fontWeight: '700' },

  walletBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.brandLine,
  },
  walletBarLabel: { fontSize: 11, color: colors.muted },
  walletBarValue: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 2 },
  walletActions: { flexDirection: 'row', gap: 8 },
  ghost: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  ghostText: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  primary: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  primaryText: { fontSize: 12.5, fontWeight: '800', color: colors.onBrand },

  progressWrap: { marginTop: 12 },
  progressCopy: { fontSize: 11, color: colors.muted, lineHeight: 16 },
  bold: { fontWeight: '900', color: colors.text },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surface,
    marginTop: 7,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.brand },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  entryIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  entryDesc: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  entryBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  entryBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.onBrand },

  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  alertIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { fontSize: 13.5, fontWeight: '900', color: colors.text },
  alertDesc: { fontSize: 11.5, color: colors.muted, marginTop: 2, lineHeight: 16 },

  strip: { marginBottom: spacing.lg },
  stripTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.6,
    marginHorizontal: spacing.md,
    marginBottom: 10,
  },
  stripRow: { paddingHorizontal: spacing.md, gap: 10 },
  spCard: {
    width: 138,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.card,
  },
  spImg: { width: '100%', height: 138, backgroundColor: colors.surfaceMuted },
  spName: { fontSize: 11.5, fontWeight: '700', color: colors.text, lineHeight: 16 },
  spPrice: { fontSize: 13, fontWeight: '900', color: colors.brand },
  spCash: { fontSize: 10.5, fontWeight: '800', color: colors.success },

  footer: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.inverse,
  },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerBrandText: { fontSize: 21, fontWeight: '900', color: colors.brand, letterSpacing: -0.9 },
  footerCopy: { fontSize: 12.5, color: colors.inverseMuted, lineHeight: 19, marginTop: 10 },
  footerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: spacing.md,
  },
  footerBottom: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  footerSmall: { fontSize: 11, color: '#b7a196' },
});
