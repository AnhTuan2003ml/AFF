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

import { layKhamPha, type DiscoverProduct } from '@/api/features';
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

const TABS = [
  { key: 'hot', nhan: '🔥 Hot' },
  { key: 'recommend', nhan: 'Đề xuất' },
  { key: 'best', nhan: 'Bán chạy' },
  { key: 'exclusive', nhan: 'Độc quyền' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const LIST_KEYS: TabKey[] = ['hot', 'recommend', 'best', 'exclusive'];

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ list?: string }>();
  const [list, setList] = useState<TabKey>('best');
  const [page, setPage] = useState(1);
  const listRef = useRef<FlatList<DiscoverProduct>>(null);

  // "Xem thêm" ở Trang chủ điều hướng kèm ?list=... → chọn đúng hạng mục.
  useEffect(() => {
    const l = params.list;
    if (l && LIST_KEYS.includes(l as TabKey)) {
      setList(l as TabKey);
      setPage(1);
    }
  }, [params.list]);

  const { data, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['discover', list, page],
    queryFn: () => layKhamPha(list, page),
  });
  const soTrang = Math.max(1, data?.knownPages ?? 1);

  function chonTab(k: TabKey) {
    if (k === list) return;
    setList(k);
    setPage(1);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }
  function doiTrang(p: number) {
    setPage(p);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  return (
    <View style={styles.screen}>
      <BrandHeader onRegister={() => router.push('/login')} />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={data?.data ?? []}
          keyExtractor={(p) => p.item_id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
          ListHeaderComponent={
            <View style={styles.head}>
              <Text style={styles.eyebrow}>SHOPPING DISCOVERY</Text>
              <Text style={styles.h1}>Sản phẩm đáng để khám phá.</Text>
              <Text style={styles.sub}>
                Duyệt sản phẩm, so sánh mức hoàn và đi thẳng đến sàn bạn muốn mua.
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabs}>
                {TABS.map((t) => {
                  const on = t.key === list;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => chonTab(t.key)}
                      style={[styles.tab, on && styles.tabOn]}>
                      <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.nhan}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
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
                  style={[styles.pagerBtn, page <= 1 && styles.pagerOff]}>
                  <Ionicons name="chevron-back" size={18} color={page <= 1 ? colors.muted : colors.brand} />
                  <Text style={[styles.pagerText, page <= 1 && { color: colors.muted }]}>Trước</Text>
                </Pressable>
                <Text style={styles.pagerInfo}>
                  Trang {page} / {soTrang}
                </Text>
                <Pressable
                  disabled={page >= soTrang}
                  onPress={() => doiTrang(page + 1)}
                  style={[styles.pagerBtn, page >= soTrang && styles.pagerOff]}>
                  <Text style={[styles.pagerText, page >= soTrang && { color: colors.muted }]}>Sau</Text>
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

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={mua}
      disabled={dang}>
      <View style={styles.mediaWrap}>
        {p.image_url ? (
          <Image source={{ uri: p.image_url }} style={styles.img} contentFit="cover" />
        ) : (
          <View style={[styles.img, styles.imgEmpty]}>
            <Ionicons name="image-outline" size={22} color={colors.muted} />
          </View>
        )}
        {phanTram !== null && phanTram > 0 && (
          <View style={styles.cashBadge}>
            <Text style={styles.cashBadgeText}>+{phanTram}%</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {p.name}
        </Text>
        <Text style={styles.price}>{gia !== null ? vnd(gia) : 'Đang cập nhật'}</Text>
        {hoaHong !== null && (
          <View style={styles.cashPill}>
            <Text style={styles.cashText}>Hoàn tới {vnd(hoaHong)}</Text>
          </View>
        )}
      </View>
    </Pressable>
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
  body: { padding: 10, gap: 4 },
  name: { fontSize: 12.5, fontWeight: '700', color: colors.text, lineHeight: 17 },
  price: { fontSize: 14, fontWeight: '900', color: colors.brand },
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
    gap: 14,
    paddingVertical: 20,
  },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pagerOff: { opacity: 0.5 },
  pagerText: { fontSize: 13.5, fontWeight: '800', color: colors.brand },
  pagerInfo: { fontSize: 13, fontWeight: '700', color: colors.text },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyNote: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
