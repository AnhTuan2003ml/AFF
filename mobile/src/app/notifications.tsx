import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { danhDauDaDoc, layThongBao, xoaTatCaThongBao, type NotificationItem } from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { CAMIO, type CamioMood } from '@/components/Mascot';
import { camio } from '@/lib/camio-voice';
import { useSession } from '@/hooks/useSession';
import { useLang, useT } from '@/i18n';
import { ngayGio } from '@/lib/format';
import { localizeNotification } from '@/lib/notification-i18n';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Thông báo — POPUP đè lên màn hình đang mở (route transparentModal trong
 * _layout.tsx: nền dưới vẫn thấy, làm mờ). Bấm ra ngoài thẻ để đóng. Mở màn là
 * đánh dấu đã đọc tất cả (đồng bộ badge chuông). Có nút "Xóa tất cả" dọn khay.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const t = useT();
  const { lang } = useLang();
  // Câu trống ổn định trong mỗi ngôn ngữ, đổi khi chuyển VI/EN.
  const EMPTY_NOTIF = useMemo(() => camio('emptyNotif'), [lang]);
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: layThongBao,
    enabled: !!user,
  });

  const danhDau = useMutation({
    mutationFn: danhDauDaDoc,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const xoaHet = useMutation({
    mutationFn: xoaTatCaThongBao,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Mở màn = đã xem → đánh dấu đọc hết (nếu còn chưa đọc).
  useEffect(() => {
    if (data && data.unread > 0) danhDau.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.unread]);

  const items = data?.items ?? [];
  const coItem = items.length > 0;

  function xacNhanXoaHet() {
    if (!coItem || xoaHet.isPending) return;
    Alert.alert(
      t('Xóa tất cả thông báo?', 'Clear all notifications?'),
      t('Toàn bộ thông báo sẽ bị xóa khỏi khay và không khôi phục được.',
        'All notifications will be removed from the tray and cannot be restored.'),
      [
        { text: t('Hủy', 'Cancel'), style: 'cancel' },
        { text: t('Xóa tất cả', 'Clear all'), style: 'destructive', onPress: () => xoaHet.mutate() },
      ],
    );
  }

  return (
    <Pressable style={styles.scrim} onPress={() => router.back()}>
      {/* Thẻ popup — chặn sự kiện bấm để không đóng khi chạm vào trong thẻ. */}
      <Pressable style={[styles.card, { marginTop: insets.top + 8 }]} onPress={() => {}}>
        <View style={styles.head}>
          <Text style={styles.headTitle}>{t('Thông báo', 'Notifications')}</Text>
          <View style={styles.headRight}>
            {coItem && user ? (
              <Pressable
                onPress={xacNhanXoaHet}
                hitSlop={8}
                disabled={xoaHet.isPending}
                style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}>
                {xoaHet.isPending ? (
                  <ActivityIndicator color={colors.danger} size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={styles.clearText}>{t('Xóa tất cả', 'Clear all')}</Text>
                  </>
                )}
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.back()} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </Pressable>
          </View>
        </View>

        {!user ? (
          <View style={styles.pad}>
            <CanDangNhap
              mo_ta={t(
                'Đăng nhập để xem thông báo về đơn hàng, hoàn tiền và nhiệm vụ.',
                'Sign in to see notifications about orders, cashback and tasks.',
              )}
            />
          </View>
        ) : isPending ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(n) => n.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={30} color={colors.muted} />
                <Text style={styles.emptyText}>{EMPTY_NOTIF}</Text>
              </View>
            }
            renderItem={({ item }) => <Dong n={item} lang={lang} />}
          />
        )}
      </Pressable>
    </Pressable>
  );
}

/** Biểu cảm linh vật theo loại thông báo — khớp web (blob-notify.js). */
function moodCua(type: string): CamioMood {
  if (type.includes('APPROVED') || type.includes('CASHBACK')) return 'haohung';
  if (type.includes('REJECTED') || type.includes('CANCEL')) return 'ngacnhien';
  if (type.includes('CLAIM') || type.includes('SUPPORT')) return 'baocao';
  return 'vuive';
}

function Dong({ n, lang }: { n: NotificationItem; lang: string }) {
  return (
    <View style={[styles.item, !n.isRead && styles.itemUnread]}>
      <View style={styles.avatar}>
        <Image source={CAMIO[moodCua(n.type)]} style={styles.avatarImg} contentFit="contain" />
        {!n.isRead && <View style={styles.dot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{localizeNotification(n.title, lang)}</Text>
        {n.body ? <Text style={styles.body}>{localizeNotification(n.body, lang)}</Text> : null}
        <Text style={styles.time}>{ngayGio(n.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Nền mờ phủ toàn màn — thấy giao diện dưới. Bấm vùng này để đóng.
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(20,12,8,0.5)',
    paddingHorizontal: 10,
    justifyContent: 'flex-start',
  },
  card: {
    maxHeight: '82%',
    backgroundColor: colors.paper,
    borderRadius: 22,
    overflow: 'hidden',
    // Đổ bóng nhẹ để nổi trên nền dưới.
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSoft,
  },
  clearText: { fontSize: 12.5, fontWeight: '800', color: colors.danger },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  center: { paddingVertical: 50, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: spacing.md },
  list: { padding: spacing.md, gap: 10 },
  item: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  itemUnread: { backgroundColor: colors.brandSoft, borderColor: colors.brandLine },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 32, height: 34 },
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  title: { fontSize: 14, fontWeight: '800', color: colors.text },
  body: { fontSize: 12.5, color: colors.inkSoft, marginTop: 3, lineHeight: 18 },
  time: { fontSize: 11, color: colors.muted, marginTop: 4 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: colors.muted },
});
