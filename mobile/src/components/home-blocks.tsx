import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { CheckinModal } from '@/components/CheckinModal';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Me } from '@/api/account';
import { layDiemDanh, layKhamPha, type DiscoverProduct } from '@/api/features';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { vnd } from '@/lib/format';
import { moLinkMua } from '@/lib/mua';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/* ==================== Dải quảng bá 3 sàn ==================== */

const SAN = [
  { ma: 'SHOPEE', ten: 'Shopee', mo: 'Dán link Shopee, ShopTik tự nhận diện và kiểm tra hoàn tiền.' },
  { ma: 'TIKTOK', ten: 'TikTok Shop', mo: 'Từ video đến giỏ hàng — link được xử lý tự động trong cùng một luồng.' },
  { ma: 'LAZADA', ten: 'Lazada', mo: 'Tra cứu sản phẩm và khoản hoàn dự kiến mà không cần đổi chế độ.' },
] as const;

// Logo thật của từng sàn (cùng ảnh web dùng). require phải là chuỗi tĩnh nên
// khai theo bản đồ, không nối chuỗi động.
const LOGO_SAN = {
  SHOPEE: require('../../assets/images/platform-shopee.webp'),
  TIKTOK: require('../../assets/images/platform-tiktok.webp'),
  LAZADA: require('../../assets/images/platform-lazada.webp'),
} as const;

/**
 * Dải quảng bá ba sàn — bản dựng lại của `.lux-platform-showcase`.
 *
 * Đây là khu QUẢNG BÁ, không phải bộ chọn: app tự nhận diện sàn từ link được
 * dán nên người dùng không cần chọn thủ công. Ba vạch bên phải bấm được để
 * chuyển, giống hệt web sau lần sửa gần đây.
 */
export function PlatformShowcase() {
  const t = useT();
  const [i, setI] = useState(0);
  const tamDung = useRef(0);
  // Mô tả từng sàn (dữ liệu tĩnh SAN ở scope module nên dịch tại đây theo mã).
  const moSan = (ma: (typeof SAN)[number]['ma'], mo: string): string => {
    switch (ma) {
      case 'SHOPEE':
        return t(mo, 'Paste a Shopee link — ShopTik detects it and checks cashback automatically.');
      case 'TIKTOK':
        return t(mo, 'From video to cart — links are handled automatically in a single flow.');
      case 'LAZADA':
        return t(mo, 'Look up products and estimated cashback without switching modes.');
      default:
        return mo;
    }
  };

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
        <Image source={LOGO_SAN[s.ma]} style={ss.showcaseLogoImg} contentFit="contain" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ss.showcaseTag}>{t('✓ ĐÃ HỖ TRỢ', '✓ SUPPORTED')}</Text>
        <Text style={ss.showcaseName}>{s.ten}</Text>
        <Text style={ss.showcaseDesc}>{moSan(s.ma, s.mo)}</Text>
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
  const t = useT();
  const toiThieu = me.minWithdrawalVnd ?? 0;
  const conThieu = Math.max(0, toiThieu - me.balances.available);
  const phanTram = toiThieu > 0 ? Math.min(100, Math.round((me.balances.available / toiThieu) * 100)) : 100;

  return (
    <View style={ss.wallet}>
      <View style={ss.walletTop}>
        <View>
          <Text style={ss.walletLabel}>{t('Số dư khả dụng', 'Available balance')}</Text>
          <Text style={ss.walletValue}>{vnd(me.balances.available)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={ss.chip}>
            <Text style={ss.chipText}>{t('Hoàn tới', 'Up to')} {me.cashbackPercent ?? 0}%</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/orders')}>
            <Text style={ss.pending}>{t('Đang chờ:', 'Pending:')} {vnd(me.balances.pending)} ›</Text>
          </Pressable>
        </View>
      </View>

      <View style={ss.walletBar}>
        <View>
          <Text style={ss.walletBarLabel}>{t('Đã mua qua ShopTik', 'Bought through ShopTik')}</Text>
          <Text style={ss.walletBarValue}>{me.purchasedProducts ?? 0} {t('sản phẩm', 'products')}</Text>
        </View>
        <View style={ss.walletActions}>
          <Pressable onPress={() => router.push('/(tabs)/wallet')} style={ss.ghost}>
            <Text style={ss.ghostText}>{t('Xem ví', 'View wallet')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/withdraw')} style={ss.primary}>
            <Text style={ss.primaryText}>{t('Rút tiền ›', 'Withdraw ›')}</Text>
          </Pressable>
        </View>
      </View>

      {conThieu > 0 && (
        <View style={ss.progressWrap}>
          <Text style={ss.progressCopy}>
            {t('Thêm', 'Add')} <Text style={ss.bold}>{vnd(conThieu)}</Text>{' '}
            {t('nữa là đủ mức rút tối thiểu', 'more to reach the minimum withdrawal of')}{' '}
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
  const t = useT();
  const { user } = useSession();
  const [mo, setMo] = useState(false);
  // Tự bật popup điểm danh khi VÀO app nếu hôm nay CHƯA điểm danh (giống web).
  // Đã điểm danh thì không hiện; vẫn mở tay được bằng nút bên dưới. Chỉ tự mở
  // một lần mỗi phiên màn hình để không lặp lại sau khi người dùng đóng.
  const { data: diemDanhData } = useQuery({
    queryKey: ['checkin'],
    queryFn: layDiemDanh,
    enabled: !!user,
  });
  const daTuMo = useRef(false);
  useEffect(() => {
    if (user && diemDanhData && !diemDanhData.checkedInToday && !daTuMo.current) {
      daTuMo.current = true;
      setMo(true);
    }
  }, [user, diemDanhData]);
  return (
    <Pressable
      onPress={() => setMo(true)}
      style={({ pressed }) => [ss.entry, pressed && { opacity: 0.85 }]}>
      <View style={ss.entryIcon}>
        <Ionicons name="calendar-outline" size={19} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ss.entryTitle}>{t('Điểm danh mỗi ngày', 'Daily check-in')}</Text>
        <Text style={ss.entryDesc}>{t('Điểm danh nhận thưởng — đừng để mất chuỗi', 'Check in for rewards — keep your streak')}</Text>
      </View>
      <View style={ss.entryBtn}>
        <Text style={ss.entryBtnText}>{t('Điểm danh', 'Check in')}</Text>
      </View>
      {/* Popup đè lên trang, nút ✕ để đóng — không chuyển màn. */}
      <CheckinModal mo={mo} dong={() => setMo(false)} />
    </Pressable>
  );
}

export function BankAlert() {
  const t = useT();
  return (
    <Pressable
      onPress={() => router.push('/bank')}
      style={({ pressed }) => [ss.alert, pressed && { opacity: 0.85 }]}>
      <View style={ss.alertIcon}>
        <Ionicons name="card-outline" size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ss.alertTitle}>{t('Hoàn tất tài khoản nhận tiền.', 'Complete your payout account.')}</Text>
        <Text style={ss.alertDesc}>
          {t(
            'Thêm và xác minh ngân hàng để có thể rút tiền hoàn khi đủ điều kiện.',
            'Add and verify a bank account so you can withdraw cashback when eligible.',
          )}
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
  const t = useT();
  // Nạp DẦN tất cả sản phẩm theo trang (20/trang) khi người dùng lướt tới cuối,
  // hết trang thì chạm cuối sẽ VÒNG LẠI đầu — như web yêu cầu.
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['strip', list],
    queryFn: ({ pageParam }) => layKhamPha(list, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.knownPages ? last.page + 1 : undefined),
  });

  const listRef = useRef<FlatList<DiscoverProduct>>(null);
  const [active, setActive] = useState(0);
  const [vpW, setVpW] = useState(0);
  const [contentW, setContentW] = useState(0);

  const sp = data?.pages.flatMap((p) => p.data) ?? [];
  if (sp.length === 0) return null;

  const trang = vpW > 0 && contentW > 0 ? Math.max(1, Math.round(contentW / vpW)) : 1;
  const soDot = Math.min(trang, 8); // không để hàng chấm dài vô hạn khi tải nhiều
  const dotActive = trang <= 1 ? 0 : Math.round((active / (trang - 1)) * (soDot - 1));

  return (
    <View style={ss.strip}>
      <View style={ss.stripHead}>
        <Text style={ss.stripTitle}>{tieuDe}</Text>
        <Pressable
          onPress={() => router.push({ pathname: '/(tabs)/discover', params: { list } })}
          hitSlop={8}>
          <Text style={ss.stripMore}>{t('Xem thêm ›', 'See more ›')}</Text>
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        horizontal
        data={sp}
        keyExtractor={(p, i) => `${p.item_id}-${i}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ss.stripRow}
        renderItem={({ item }) => <TheSP p={item} />}
        onLayout={(e) => setVpW(e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => setContentW(w)}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const { contentOffset, layoutMeasurement } = e.nativeEvent;
          setActive(Math.round(contentOffset.x / (layoutMeasurement.width || 1)));
        }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasNextPage) {
            if (!isFetchingNextPage) void fetchNextPage();
          } else {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }
        }}
      />
      {soDot > 1 && (
        <View style={ss.stripDots}>
          {Array.from({ length: soDot }).map((_, k) => (
            <View key={k} style={[ss.dot, k === dotActive && ss.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

function TheSP({ p }: { p: DiscoverProduct }) {
  const t = useT();
  const { user } = useSession();
  const [dang, setDang] = useState(false);
  const gia = p.price_vnd ? Number(p.price_vnd) : null;
  const hoan =
    gia !== null && p.commission_rate_bps
      ? Math.floor((gia * p.commission_rate_bps) / 10000)
      : null;

  async function mua() {
    if (dang) return;
    if (!user) {
      router.push('/login');
      return;
    }
    setDang(true);
    try {
      await moLinkMua(p.product_url);
    } catch (e) {
      Alert.alert(
        t('Chưa mở được', 'Could not open'),
        e instanceof Error && e.message ? e.message : t('Thử lại sau ít phút.', 'Please try again in a few minutes.'),
      );
    } finally {
      setDang(false);
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [ss.spCard, pressed && { opacity: 0.85 }]}
      onPress={mua}
      disabled={dang}>
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
        <Text style={ss.spPrice}>{gia !== null ? vnd(gia) : t('Đang cập nhật', 'Updating')}</Text>
        {hoan !== null && (
          <Text style={ss.spCash}>{dang ? t('Đang mở…', 'Opening…') : `${t('Hoàn tới', 'Up to')} ${vnd(hoan)}`}</Text>
        )}
      </View>
    </Pressable>
  );
}

/* ==================== Chân trang ==================== */

export function AppFooter() {
  const t = useT();
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
        {t(
          'Một trải nghiệm mua sắm gọn hơn: kiểm tra hoàn tiền, mua qua liên kết và theo dõi ví minh bạch.',
          'A cleaner shopping experience: check cashback, buy through links and track your wallet transparently.',
        )}
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
    width: 58,
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseLogoText: { fontSize: 24, fontWeight: '900', color: colors.brand },
  showcaseLogoImg: { width: 42, height: 42 },
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
  stripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.md,
    marginBottom: 10,
  },
  stripTitle: { fontSize: 19, fontWeight: '900', color: colors.text, letterSpacing: -0.6 },
  stripMore: { fontSize: 13, fontWeight: '800', color: colors.brand },
  stripRow: { paddingHorizontal: spacing.md, gap: 10 },
  stripDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
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
