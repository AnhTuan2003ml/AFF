import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { danhDauDaDoc, layThongBao, type NotificationItem } from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { CAMIO, type CamioMood } from '@/components/Mascot';
import { camio } from '@/lib/camio-voice';
import { useSession } from '@/hooks/useSession';
import { ngayGio } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Thông báo — dựng lại danh sách thông báo của web. Mở màn này là đánh dấu đã
 * đọc tất cả (đồng bộ số badge ở chuông).
 */
const EMPTY_NOTIF = camio('emptyNotif');

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
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

  // Mở màn = đã xem → đánh dấu đọc hết (nếu còn chưa đọc).
  useEffect(() => {
    if (data && data.unread > 0) danhDau.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.unread]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 22 }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Thông báo</Text>
        <View style={{ width: 22 }} />
      </View>

      {!user ? (
        <CanDangNhap mo_ta="Đăng nhập để xem thông báo về đơn hàng, hoàn tiền và nhiệm vụ." />
      ) : isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={30} color={colors.muted} />
              <Text style={styles.emptyText}>{EMPTY_NOTIF}</Text>
            </View>
          }
          renderItem={({ item }) => <Dong n={item} />}
        />
      )}
    </View>
  );
}

/** Biểu cảm linh vật theo loại thông báo — khớp web (blob-notify.js). */
function moodCua(type: string): CamioMood {
  if (type.includes('APPROVED') || type.includes('CASHBACK')) return 'haohung';
  if (type.includes('REJECTED') || type.includes('CANCEL')) return 'ngacnhien';
  if (type.includes('CLAIM') || type.includes('SUPPORT')) return 'baocao';
  return 'vuive';
}

function Dong({ n }: { n: NotificationItem }) {
  return (
    <View style={[styles.item, !n.isRead && styles.itemUnread]}>
      <View style={styles.avatar}>
        <Image source={CAMIO[moodCua(n.type)]} style={styles.avatarImg} contentFit="contain" />
        {!n.isRead && <View style={styles.dot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{n.title}</Text>
        {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
        <Text style={styles.time}>{ngayGio(n.createdAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text },

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
