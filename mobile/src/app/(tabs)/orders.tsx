import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
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

import { layDonHang, type Order } from '@/api/account';
import { baoChuaGhiNhan } from '@/api/bank';
import { BrandHeader } from '@/components/BrandHeader';
import { CanDangNhap } from '@/components/CanDangNhap';
import { useSession } from '@/hooks/useSession';
import { useLang, useT } from '@/i18n';
import { ngay, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';
import { camio } from '@/lib/camio-voice';

/**
 * Nhãn trạng thái đơn — dùng đúng bộ chữ của web để người dùng không phải học
 * hai bảng thuật ngữ. Ánh xạ trạng thái nằm ở src/services/order-import.ts:
 * COMPLETED→APPROVED, CANCEL→CANCELLED, còn lại→PENDING.
 */
function nhan(
  o: Order,
  t: ReturnType<typeof useT>,
): { chu: string; mau: string; nen: string } {
  const cho = { mau: colors.warning, nen: colors.warningSoft };
  const xong = { mau: colors.success, nen: colors.successSoft };
  const huy = { mau: colors.danger, nen: colors.dangerSoft };
  switch (o.status) {
    case 'AWAITING':
      return { chu: t('Chờ sàn xác nhận', 'Awaiting platform confirmation'), ...cho };
    case 'PENDING':
      return { chu: t('Đang duyệt', 'Under review'), ...cho };
    case 'APPROVED':
      return o.cashback_released_at
        ? { chu: t('Đã về ví', 'Added to wallet'), ...xong }
        : { chu: t('Hoàn thành, chờ về ví', 'Completed, pending wallet'), ...xong };
    case 'PAID':
      return { chu: t('Đã về ví', 'Added to wallet'), ...xong };
    case 'CANCELLED':
      return { chu: t('Đã hủy', 'Cancelled'), ...huy };
    case 'UNTRACKED':
      return { chu: t('Không ghi nhận', 'Not tracked'), ...huy };
    case 'INVALID':
    case 'REVERSED':
      return { chu: t('Không hợp lệ', 'Invalid'), ...huy };
    default:
      return { chu: t('Chờ sàn xác nhận', 'Awaiting platform confirmation'), ...cho };
  }
}

// Bốn giai đoạn tách bạch (đồng bộ với web — xem src/services/order-history.ts):
// Đang chờ = lượt mua sàn chưa trả mã đơn · Đang duyệt = sàn đã có đơn, chờ
// duyệt · Đã duyệt = đơn thành công · Đã về ví = nhóm con đã cộng vào ví.
const TABS = [
  { key: 'ALL', nhan: 'Tất cả', nhanEn: 'All' },
  { key: 'WAITING', nhan: 'Đang chờ', nhanEn: 'Waiting' },
  { key: 'PENDING', nhan: 'Đang duyệt', nhanEn: 'Under review' },
  { key: 'APPROVED', nhan: 'Đã duyệt', nhanEn: 'Approved' },
  { key: 'PAID', nhan: 'Đã về ví', nhanEn: 'In wallet' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function baoDon(o: Order, t: ReturnType<typeof useT>) {
  Alert.alert(
    t('Báo đơn chưa ghi nhận?', 'Report an untracked order?'),
    t(
      'Gửi yêu cầu để đội hỗ trợ kiểm tra đơn này. Phản hồi sẽ hiện ở mục Hỗ trợ.',
      'Send a request for the support team to check this order. The reply will appear in Support.',
    ),
    [
      { text: t('Hủy', 'Cancel'), style: 'cancel' },
      {
        text: t('Gửi', 'Send'),
        onPress: async () => {
          try {
            await baoChuaGhiNhan(
              o.platform_order_id ?? o.id,
              'Đơn này tôi đã mua nhưng chưa thấy ghi nhận/hoàn tiền đúng. Nhờ đội hỗ trợ kiểm tra giúp.',
            );
            Alert.alert(
              t('Đã gửi', 'Sent'),
              t(
                'Đội hỗ trợ sẽ kiểm tra và phản hồi ở mục Hỗ trợ.',
                'The support team will check and reply in Support.',
              ),
            );
          } catch (e) {
            Alert.alert(
              t('Chưa gửi được', 'Could not send'),
              e instanceof Error ? e.message : t('Thử lại sau.', 'Please try again later.'),
            );
          }
        },
      },
    ],
  );
}

function khopTab(o: Order, tab: TabKey): boolean {
  if (tab === 'ALL') return true;
  // Đang chờ: lượt bấm mua chưa có đơn thật (còn hạn ghi nhận hoặc quá hạn).
  if (tab === 'WAITING') return o.status === 'AWAITING' || o.status === 'UNTRACKED';
  // Đang duyệt: sàn đã có đơn, đang chờ duyệt hoa hồng.
  if (tab === 'PENDING') return o.status === 'PENDING';
  // Đã duyệt: đơn thành công — gồm cả đơn còn chờ về ví lẫn đã về ví.
  if (tab === 'APPROVED') return o.status === 'APPROVED' || o.status === 'PAID';
  // Đã về ví: nhóm con của Đã duyệt — đã hết hạn giữ và cộng vào số dư.
  return o.status === 'PAID' || !!o.cashback_released_at;
}

export default function OrdersScreen() {
  const { user } = useSession();
  const t = useT();
  const { lang } = useLang();
  // Câu trống ổn định trong mỗi ngôn ngữ, đổi khi chuyển VI/EN.
  const EMPTY_ORDERS = useMemo(() => camio('emptyOrders'), [lang]);
  const [tab, setTab] = useState<TabKey>('ALL');

  const { data, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: layDonHang,
    enabled: !!user,
  });

  const loc = (data ?? []).filter((o) => khopTab(o, tab));

  if (!user) {
    return (
      <View style={styles.screen}>
        <BrandHeader />
        <CanDangNhap
          mo_ta={t(
            'Đăng nhập để xem đơn đã mua qua ShopTik và trạng thái đối soát của từng đơn.',
            'Sign in to see orders bought through ShopTik and the reconciliation status of each one.',
          )}
        />
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
          data={loc}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.brand}
            />
          }
          ListHeaderComponent={
            <View style={styles.head}>
              <Text style={styles.h1}>{t('Đơn hàng', 'Orders')}</Text>
              <Text style={styles.sub}>
                {loc.length}{' '}
                {t(
                  'đơn trong bộ lọc hiện tại · mua qua liên kết ShopTik Affiliate',
                  'orders in this filter · bought via ShopTik Affiliate links',
                )}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabs}>
                {TABS.map((tb) => {
                  const on = tb.key === tab;
                  return (
                    <Pressable
                      key={tb.key}
                      onPress={() => setTab(tb.key)}
                      style={[styles.tab, on && styles.tabOn]}>
                      <Text style={[styles.tabText, on && styles.tabTextOn]}>
                        {t(tb.nhan, tb.nhanEn)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{EMPTY_ORDERS}</Text>
              <Text style={styles.emptyNote}>
                {t(
                  'Dán link ở Trang chủ và bấm Mua ngay — đơn hiện ở đây ngay khi bạn bấm, trước cả lúc sàn xác nhận. Đi săn hoàn thôi 🧡',
                  'Paste a link on Home and tap Buy now — the order shows up here the moment you tap, even before the platform confirms it. Happy cashback hunting 🧡',
                )}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const n = nhan(item, t);
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
                      {item.product_name ?? t('Sản phẩm không rõ tên', 'Unnamed product')}
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
                    <Text style={styles.amountLabel}>{t('Giá trị đơn', 'Order value')}</Text>
                    <Text style={styles.amountValue}>
                      {vnd(item.order_amount_vnd ?? item.product_price_vnd)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.amountLabel}>{t('Tiền hoàn', 'Cashback')}</Text>
                    <Text style={[styles.amountValue, { color: colors.success }]}>
                      {item.cashback_vnd ? vnd(item.cashback_vnd) : t('Đang cập nhật', 'Updating')}
                    </Text>
                  </View>
                </View>

                {item.status === 'CANCELLED' && item.cancel_reason ? (
                  <Text style={styles.reason}>
                    {t('Lý do hủy', 'Cancellation reason')}: {item.cancel_reason}
                  </Text>
                ) : null}

                <Pressable onPress={() => baoDon(item, t)} hitSlop={6} style={styles.bao}>
                  <Ionicons name="alert-circle-outline" size={15} color={colors.muted} />
                  <Text style={styles.baoText}>{t('Báo chưa ghi nhận', 'Report untracked')}</Text>
                </Pressable>
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
  head: { marginBottom: 4 },
  h1: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 4, lineHeight: 18 },
  tabs: { gap: 8, paddingVertical: 12 },
  tab: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 13, fontWeight: '800', color: colors.text },
  tabTextOn: { color: colors.onBrand },

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
  bao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingTop: 4,
  },
  baoText: { fontSize: 12, fontWeight: '700', color: colors.muted },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyNote: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
