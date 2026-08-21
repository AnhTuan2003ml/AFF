import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { layKhamPha, type DiscoverProduct } from '@/api/features';
import { BrandHeader } from '@/components/BrandHeader';
import { vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Khám phá — sản phẩm Shopee đang hoàn tiền, lấy từ kho `shopee_offer_products`
 * mà tiến trình nền thu thập theo lịch (services/discover-harvest.ts).
 *
 * Kho rỗng là chuyện bình thường ở máy dev: dữ liệu chỉ có sau khi admin bật
 * lịch thu thập ở /backoffice/sync. Nên màn hình phải nói rõ điều đó thay vì
 * hiện danh sách trắng khiến người xem tưởng app hỏng.
 */
export default function DiscoverScreen() {
  const { data, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['discover'],
    queryFn: () => layKhamPha('best', 1),
  });

  return (
    <View style={styles.screen}>
      <BrandHeader onRegister={() => router.push('/login')} />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(p) => p.item_id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
          ListHeaderComponent={
            <View>
              <Text style={styles.h1}>Khám phá</Text>
              <Text style={styles.sub}>Sản phẩm bán chạy đang có hoàn tiền</Text>
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
        />
      )}
    </View>
  );
}

function TheSanPham({ p }: { p: DiscoverProduct }) {
  const gia = p.price_vnd ? Number(p.price_vnd) : null;
  // Hoa hồng lưu theo bps (1/10000) — giống cách backend tính, không đổi sang %
  // ở tầng hiển thị để tránh sai số làm tròn hai lần.
  const hoaHong =
    gia !== null && p.commission_rate_bps
      ? Math.floor((gia * p.commission_rate_bps) / 10000)
      : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() => router.push('/(tabs)')}>
      {p.image_url ? (
        <Image source={{ uri: p.image_url }} style={styles.img} contentFit="cover" />
      ) : (
        <View style={[styles.img, styles.imgEmpty]}>
          <Ionicons name="image-outline" size={22} color={colors.muted} />
        </View>
      )}
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
  h1: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 4 },

  card: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  img: { width: '100%', aspectRatio: 1, backgroundColor: colors.surfaceMuted },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
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

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyNote: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
