import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

import {
  layKhamPha,
  layKhamPhaLazada,
  layVoucher,
  type DiscoverProduct,
  type ShopeeVoucher,
} from '@/api/features';
import { BrandHeader } from '@/components/BrandHeader';
import { useSession } from '@/hooks/useSession';
import { vnd } from '@/lib/format';
import { moLinkMua } from '@/lib/mua';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Khám phá — dựng lại `px-discover` của web ở khổ điện thoại: hero (eyebrow +
 * tiêu đề), hàng tab lọc danh mục, rồi lưới sản phẩm 2 cột có badge hoàn %.
 * Sản phẩm lấy từ kho harvest theo từng list (recommend/best/exclusive).
 */

// Sàn ở CẤP CAO NHẤT; bên trong mới tới hạng mục (giống web).
type Platform = 'shopee' | 'lazada';

const SHOPEE_TABS = [
  { key: 'hot', nhan: '🔥 Hot' },
  { key: 'voucher', nhan: '🎟️ Voucher' },
  { key: 'recommend', nhan: 'Đề xuất' },
  { key: 'best', nhan: 'Bán chạy' },
  { key: 'exclusive', nhan: 'Độc quyền' },
] as const;

// Lazada (feed affiliate): Đề xuất · Hoa hồng cao (hot) · Bán chạy.
const LAZADA_TABS = [
  { key: 'recommend', nhan: 'Đề xuất' },
  { key: 'hot', nhan: '🔥 Hoa hồng cao' },
  { key: 'best', nhan: 'Bán chạy' },
] as const;

type TabKey = (typeof SHOPEE_TABS)[number]['key'];
type ProductList = 'hot' | 'recommend' | 'best' | 'exclusive';

const LIST_KEYS: TabKey[] = ['hot', 'voucher', 'recommend', 'best', 'exclusive'];

/** Cửa sổ tối đa 5 số trang quanh trang hiện tại (để không tràn hàng). */
function pageWindow(cur: number, total: number): number[] {
  const span = 5;
  let start = Math.max(1, cur - 2);
  const end = Math.min(total, start + span - 1);
  start = Math.max(1, end - span + 1);
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ list?: string }>();
  const [platform, setPlatform] = useState<Platform>('shopee');
  const [list, setList] = useState<TabKey>('best');
  const [page, setPage] = useState(1);
  const listRef = useRef<FlatList<DiscoverProduct>>(null);
  const laVoucher = platform === 'shopee' && list === 'voucher';
  const tabsAll = platform === 'lazada' ? LAZADA_TABS : SHOPEE_TABS;
  // Voucher là danh sách riêng, không liên quan các list sản phẩm → khi đang ở
  // tab Voucher thì ẩn Đề xuất/Bán chạy/Độc quyền (giữ Hot + Voucher).
  const tabs = laVoucher
    ? tabsAll.filter(
        (t) => t.key !== 'recommend' && t.key !== 'best' && t.key !== 'exclusive',
      )
    : tabsAll;

  // "Xem thêm" ở Trang chủ điều hướng kèm ?list=... → chọn đúng hạng mục.
  useEffect(() => {
    const l = params.list;
    if (l && LIST_KEYS.includes(l as TabKey)) {
      setList(l as TabKey);
      setPage(1);
    }
  }, [params.list]);

  const { data, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['discover', platform, list, page],
    queryFn: () =>
      platform === 'lazada'
        ? layKhamPhaLazada(list as 'hot' | 'best' | 'recommend', page)
        : layKhamPha(list as ProductList, page),
    enabled: !laVoucher,
  });
  const voucherQ = useQuery({
    queryKey: ['vouchers'],
    queryFn: layVoucher,
    enabled: laVoucher,
  });
  const soTrang = Math.max(1, data?.knownPages ?? 1);

  function chonTab(k: TabKey) {
    if (k === list) return;
    setList(k);
    setPage(1);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }
  // Cấp 1 — đổi sàn: về hạng mục mặc định của sàn (Shopee=Bán chạy, Lazada=Đề xuất).
  function chonSan(p: Platform) {
    if (p === platform) return;
    setPlatform(p);
    setList(p === 'lazada' ? 'recommend' : 'best');
    setPage(1);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }
  function doiTrang(p: number) {
    setPage(p);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  const header = (
    <View style={styles.head}>
      <Text style={styles.eyebrow}>SHOPPING DISCOVERY</Text>
      <Text style={styles.h1}>Sản phẩm đáng để khám phá.</Text>
      <Text style={styles.sub}>
        Duyệt sản phẩm, so sánh mức hoàn và đi thẳng đến sàn bạn muốn mua.
      </Text>
      {/* CẤP 1 — chọn sàn (mặc định Shopee). */}
      <View style={styles.platSwitch}>
        <Pressable
          onPress={() => chonSan('shopee')}
          style={[styles.platBtn, platform === 'shopee' && styles.platBtnShopee]}>
          <Text style={[styles.platText, platform === 'shopee' && styles.platTextOn]}>
            Shopee
          </Text>
        </Pressable>
        <Pressable
          onPress={() => chonSan('lazada')}
          style={[styles.platBtn, platform === 'lazada' && styles.platBtnLazada]}>
          <Text style={[styles.platText, platform === 'lazada' && styles.platTextOn]}>
            Lazada
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}>
        {tabs.map((t) => {
          const on = t.key === list;
          const noiBat = t.key === 'hot' || t.key === 'voucher';
          return (
            <Pressable
              key={t.key}
              onPress={() => chonTab(t.key)}
              style={[
                styles.tab,
                noiBat && styles.tabHot,
                on && styles.tabOn,
                on && noiBat && styles.tabHotOn,
              ]}>
              <Text style={[styles.tabText, noiBat && styles.tabHotText, on && styles.tabTextOn]}>
                {t.nhan}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const dangTai = laVoucher ? voucherQ.isPending : isPending;

  return (
    <View style={styles.screen}>
      <BrandHeader onRegister={() => router.push('/login')} />
      {dangTai ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : laVoucher ? (
        <FlatList
          key="voucher"
          data={voucherQ.data?.data ?? []}
          keyExtractor={(v) => v.code}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={voucherQ.isRefetching}
              onRefresh={voucherQ.refetch}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="pricetags-outline" size={30} color={colors.muted} />
              <Text style={styles.emptyTitle}>Chưa có voucher</Text>
              <Text style={styles.emptyNote}>Mã giảm giá được làm mới mỗi ngày. Quay lại sau nhé.</Text>
            </View>
          }
          renderItem={({ item }) => <TheVoucher v={item} />}
        />
      ) : (
        <FlatList
          key="product"
          ref={listRef}
          data={data?.data ?? []}
          keyExtractor={(p) => p.item_id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={30} color={colors.muted} />
              <Text style={styles.emptyTitle}>Kho sản phẩm đang trống</Text>
              <Text style={styles.emptyNote}>
                Danh sách này do tiến trình thu thập nền đổ về theo lịch. Quản trị
                viên bật lịch ở trang vận hành là sản phẩm sẽ hiện ra đây.
              </Text>
            </View>
          }
          renderItem={({ item }) => <TheSanPham p={item} />}
          ListFooterComponent={
            (data?.data.length ?? 0) > 0 ? (
              <View style={styles.pager}>
                <Pressable
                  disabled={page <= 1}
                  onPress={() => doiTrang(page - 1)}
                  style={[styles.pageNav, page <= 1 && styles.pagerOff]}>
                  <Ionicons name="chevron-back" size={18} color={page <= 1 ? colors.muted : colors.brand} />
                </Pressable>
                {pageWindow(page, soTrang).map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => n !== page && doiTrang(n)}
                    style={[styles.pageNum, n === page && styles.pageNumOn]}>
                    <Text style={[styles.pageNumText, n === page && styles.pageNumTextOn]}>{n}</Text>
                  </Pressable>
                ))}
                <Pressable
                  disabled={page >= soTrang}
                  onPress={() => doiTrang(page + 1)}
                  style={[styles.pageNav, page >= soTrang && styles.pagerOff]}>
                  <Ionicons name="chevron-forward" size={18} color={page >= soTrang ? colors.muted : colors.brand} />
                </Pressable>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function TheVoucher({ v }: { v: ShopeeVoucher }) {
  async function chep() {
    await Clipboard.setStringAsync(v.code);
    Alert.alert('Đã chép mã', v.code + ' — dán vào Shopee khi thanh toán.');
  }
  async function dungNgay() {
    await Clipboard.setStringAsync(v.code); // chép sẵn để dán ở Shopee
    await WebBrowser.openBrowserAsync(v.use_url).catch(() => {});
  }
  // Ảnh placeholder Shopee (nhỏ, ~168px) coi như không có → dùng logo ShopTik.
  const [logoLoi, setLogoLoi] = useState(false);
  // Cột trái ảnh (fallback logo ShopTik), cột phải thông tin + nút dưới.
  return (
    <View style={styles.vCard}>
      <Image
        source={
          v.logo_url && !logoLoi
            ? { uri: v.logo_url }
            : require('../../../assets/images/brand-logo.png')
        }
        style={styles.vLogo}
        contentFit={v.logo_url && !logoLoi ? 'cover' : 'contain'}
        onError={() => setLogoLoi(true)}
        onLoad={(e) => {
          const w = e?.source?.width ?? 0;
          if (w && w <= 170) setLogoLoi(true);
        }}
      />
      <View style={styles.vInfo}>
        {v.label ? <Text style={styles.vLabel}>{v.label}</Text> : null}
        <Text style={styles.vShop} numberOfLines={1}>
          {v.shop_name || 'Shopee'}
        </Text>
        <Text style={styles.vTitle} numberOfLines={2}>
          {v.title}
        </Text>
        {v.expiry_text ? <Text style={styles.vExpiry}>{v.expiry_text}</Text> : null}
        <View style={styles.vActions}>
          <Pressable onPress={chep} style={({ pressed }) => [styles.vBtnCopy, pressed && { opacity: 0.7 }]}>
            <Text style={styles.vBtnCopyText} numberOfLines={1}>Mã: {v.code}</Text>
          </Pressable>
          <Pressable onPress={dungNgay} style={({ pressed }) => [styles.vBtnUse, pressed && { opacity: 0.7 }]}>
            <Text style={styles.vBtnUseText}>Dùng ngay ↗</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TheSanPham({ p }: { p: DiscoverProduct }) {
  const { user } = useSession();
  const [dang, setDang] = useState(false);
  const gia = p.price_vnd ? Number(p.price_vnd) : null;
  const hoaHong =
    gia !== null && p.commission_rate_bps
      ? Math.floor((gia * p.commission_rate_bps) / 10000)
      : null;
  // Badge % giống web: bps → %, làm tròn.
  const phanTram = p.commission_rate_bps ? Math.round(p.commission_rate_bps / 100) : null;

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
        'Chưa mở được',
        e instanceof Error && e.message ? e.message : 'Thử lại sau ít phút.',
      );
    } finally {
      setDang(false);
    }
  }

  const giaGoc = p.original_price_vnd ? Number(p.original_price_vnd) : null;
  const [anhLoi, setAnhLoi] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.mediaWrap}>
        {p.image_url && !anhLoi ? (
          <Image
            source={{ uri: p.image_url }}
            style={styles.img}
            contentFit="cover"
            onError={() => setAnhLoi(true)}
            onLoad={(e) => {
              const w = e?.source?.width ?? 0;
              if (w && w <= 170) setAnhLoi(true);
            }}
          />
        ) : (
          // Ảnh hỏng/thiếu/placeholder → dùng logo ShopTik thay vì ô trống.
          <Image
            source={require('../../../assets/images/brand-logo.png')}
            style={styles.img}
            contentFit="contain"
          />
        )}
        {phanTram !== null && phanTram > 0 && (
          <View style={styles.cashBadge}>
            <Text style={styles.cashBadgeText}>+{phanTram}%</Text>
          </View>
        )}
        {p.discount_percent != null && p.discount_percent > 0 && (
          <View style={styles.discBadge}>
            <Text style={styles.discBadgeText}>-{p.discount_percent}%</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {p.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{gia !== null ? vnd(gia) : 'Đang cập nhật'}</Text>
          {giaGoc !== null && gia !== null && giaGoc > gia && (
            <Text style={styles.priceOld}>{vnd(giaGoc)}</Text>
          )}
        </View>
        {hoaHong !== null && (
          <View style={styles.cashPill}>
            <Text style={styles.cashText}>Hoàn tới {vnd(hoaHong)}</Text>
          </View>
        )}
        <Pressable
          onPress={mua}
          disabled={dang}
          style={({ pressed }) => [styles.buyBtn, (pressed || dang) && { opacity: 0.7 }]}>
          {dang ? (
            <ActivityIndicator size="small" color={colors.onBrand} />
          ) : (
            <>
              <Ionicons name="cart-outline" size={14} color={colors.onBrand} />
              <Text style={styles.buyText}>Mua nhận hoàn tiền</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  head: { marginBottom: spacing.sm },
  eyebrow: { fontSize: 10.5, fontWeight: '900', color: colors.brand, letterSpacing: 1.4 },
  h1: { fontSize: 27, fontWeight: '900', color: colors.text, letterSpacing: -1, marginTop: 6 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
  tabs: { gap: 8, paddingVertical: 14 },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: '800', color: colors.text },
  tabTextOn: { color: colors.onBrand },
  // Tab Hot nổi bật: viền + chữ cam đỏ khi chưa chọn, nền đỏ khi chọn.
  tabHot: { borderColor: '#ff5a1f', backgroundColor: '#fff2ec' },
  tabHotOn: { backgroundColor: '#ff5a1f', borderColor: '#ff5a1f' },
  tabHotText: { color: '#d63e12' },

  // Công tắc chọn SÀN cấp 1 (segmented, màu thương hiệu).
  platSwitch: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 4,
    padding: 4,
    marginTop: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  platBtn: { paddingHorizontal: 22, paddingVertical: 9, borderRadius: radius.pill },
  platBtnShopee: { backgroundColor: '#ee4d2d' },
  platBtnLazada: { backgroundColor: '#1d2d86' },
  platText: { fontSize: 13, fontWeight: '900', color: colors.text },
  platTextOn: { color: '#fff' },

  card: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  mediaWrap: { position: 'relative' },
  img: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceMuted },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
  cashBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  cashBadgeText: { fontSize: 10.5, fontWeight: '900', color: colors.onBrand },
  discBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ee4d2d',
  },
  discBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  body: { padding: 10, gap: 5 },
  name: { fontSize: 12.5, fontWeight: '700', color: colors.text, lineHeight: 17 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  price: { fontSize: 14, fontWeight: '900', color: colors.brand },
  priceOld: {
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
    minHeight: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  buyText: { fontSize: 11.5, fontWeight: '900', color: colors.onBrand },
  cashPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  cashText: { fontSize: 10.5, fontWeight: '800', color: colors.success },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
    flexWrap: 'wrap',
  },
  pageNav: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pageNum: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pageNumOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pageNumText: { fontSize: 14, fontWeight: '800', color: colors.text },
  pageNumTextOn: { color: colors.onBrand },
  pagerOff: { opacity: 0.4 },

  // ── Voucher ──
  vCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: '#ee4d2d',
    padding: 12,
    marginBottom: spacing.md,
  },
  vInfo: { flex: 1, gap: 4 },
  vLogo: { width: 104, height: 104, borderRadius: 12, backgroundColor: '#fff' },
  vLabel: { fontSize: 11, fontWeight: '800', color: '#eb3600' },
  vShop: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  vTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text, lineHeight: 18 },
  vExpiry: { fontSize: 11.5, color: colors.muted },
  vActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  vBtnCopy: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ee4d2d',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(238,77,45,0.08)',
  },
  vBtnCopyText: { fontSize: 12, fontWeight: '800', color: '#ee4d2d' },
  vBtnUse: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ee4d2d',
  },
  vBtnUseText: { fontSize: 12, fontWeight: '900', color: '#fff' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyNote: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
