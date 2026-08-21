import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { layDonHang, type Order } from '@/api/account';
import { BrandHeader } from '@/components/BrandHeader';
import { CanDangNhap } from '@/components/CanDangNhap';
import { useSession } from '@/hooks/useSession';
import { ngay, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Nhãn trạng thái đơn — dùng đúng bộ chữ của web để người dùng không phải học
 * hai bảng thuật ngữ. Ánh xạ trạng thái nằm ở src/services/order-import.ts:
 * COMPLETED→APPROVED, CANCEL→CANCELLED, còn lại→PENDING.
 */
function nhan(o: Order): { chu: string; mau: string; nen: string } {
  switch (o.status) {
    case 'APPROVED':
      return { chu: 'Đã duyệt', mau: colors.success, nen: colors.successSoft };
    case 'PAID':
      return { chu: 'Đã về ví', mau: colors.success, nen: colors.successSoft };
    case 'CANCELLED':
      return { chu: 'Đã hủy', mau: colors.danger, nen: colors.dangerSoft };
    default:
      return { chu: 'Chờ sàn xác nhận', mau: colors.warning, nen: colors.warningSoft };
  }
}

export default function OrdersScreen() {
  const { user } = useSession();

  const { data, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: layDonHang,
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <BrandHeader />
        <CanDangNhap mo_ta="Đăng nhập để xem đơn đã mua qua ShopTik và trạng thái đối soát của từng đơn." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <BrandHeader />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={<Text style={styles.h1}>Đơn hàng</Text>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Chưa có đơn nào</Text>
              <Text style={styles.emptyNote}>
                Dán link ở Trang chủ và bấm Mua ngay — đơn sẽ hiện ở đây ngay khi
                bạn bấm, trước cả lúc sàn xác nhận.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const n = nhan(item);
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  {item.product_image_url ? (
                    <Image
                      source={{ uri: item.product_image_url }}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.product_name ?? 'Sản phẩm không rõ tên'}
                    </Text>
                    <Text style={styles.meta}>
                      {item.platform} · {ngay(item.purchased_at ?? item.created_at)}
                    </Text>
                    <View style={[styles.pill, { backgroundColor: n.nen }]}>
                      <Text style={[styles.pillText, { color: n.mau }]}>{n.chu}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.amounts}>
                  <View>
                    <Text style={styles.amountLabel}>Giá trị đơn</Text>
                    <Text style={styles.amountValue}>
                      {vnd(item.order_amount_vnd ?? item.product_price_vnd)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amountLabel}>Tiền hoàn</Text>
                    <Text style={[styles.amountValue, { color: colors.success }]}>
                      {item.cashback_vnd ? vnd(item.cashback_vnd) : 'Đang cập nhật'}
                    </Text>
                  </View>
                </View>

                {item.status === 'CANCELLED' && item.cancel_reason ? (
                  <Text style={styles.reason}>Lý do hủy: {item.cancel_reason}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  h1: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1, marginBottom: 4 },

  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 12,
  },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 68, height: 68, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  thumbEmpty: { backgroundColor: colors.surfaceMuted },
  info: { flex: 1, gap: 4 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 19 },
  meta: { fontSize: 11.5, color: colors.muted },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginTop: 2,
  },
  pillText: { fontSize: 11, fontWeight: '800' },

  amounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  amountLabel: { fontSize: 11, color: colors.muted },
  amountValue: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 2 },
  reason: { fontSize: 12, color: colors.danger },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyNote: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
