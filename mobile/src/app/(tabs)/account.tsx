import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { layLenhRut } from '@/api/account';
import { apiBaseUrl } from '@/api/client';
import { BrandHeader } from '@/components/BrandHeader';
import { CanDangNhap } from '@/components/CanDangNhap';
import { useSession } from '@/hooks/useSession';
import { ngay, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

export default function AccountScreen() {
  const { user, dangXuat } = useSession();

  const { data: lenhRut } = useQuery({
    queryKey: ['withdrawals'],
    queryFn: layLenhRut,
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <BrandHeader />
        <CanDangNhap mo_ta="Đăng nhập để xem hồ sơ, tài khoản ngân hàng nhận tiền và lịch sử rút." />
      </View>
    );
  }

  function hoiDangXuat() {
    Alert.alert('Đăng xuất?', 'Bạn sẽ cần đăng nhập lại để vào tài khoản.', [
      { text: 'Ở lại', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: () => void dangXuat() },
    ]);
  }

  return (
    <View style={styles.screen}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>Tài khoản</Text>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user.fullName || user.email || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.fullName || 'Chưa đặt tên'}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
        </View>

        <Text style={styles.h2}>Thao tác</Text>
        <View style={styles.card}>
          <MenuRow
            icon="card-outline"
            label="Tài khoản ngân hàng"
            onPress={() => router.push('/bank')}
          />
          <MenuRow
            icon="arrow-up-circle-outline"
            label="Rút tiền"
            onPress={() => router.push('/withdraw')}
            divider
          />
          <MenuRow
            icon="calendar-outline"
            label="Điểm danh"
            onPress={() => router.push('/checkin')}
            divider
          />
          <MenuRow
            icon="flag-outline"
            label="Nhiệm vụ"
            onPress={() => router.push('/missions')}
            divider
          />
          <MenuRow
            icon="people-outline"
            label="Giới thiệu bạn bè"
            onPress={() => router.push('/referrals')}
            divider
          />
        </View>

        <Text style={styles.h2}>Lệnh rút gần đây</Text>
        <View style={styles.card}>
          {lenhRut && lenhRut.length > 0 ? (
            lenhRut.slice(0, 5).map((w, i) => (
              <View key={w.id} style={[styles.rutRow, i > 0 && styles.rutDivider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rutAmount}>{vnd(w.amount_vnd)}</Text>
                  <Text style={styles.rutMeta}>
                    {w.bank_code ?? 'Ngân hàng'} ···{w.bank_last4 ?? '••••'} ·{' '}
                    {ngay(w.requested_at)}
                  </Text>
                </View>
                <Text style={styles.rutStatus}>{w.status}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyRow}>Chưa có lệnh rút nào.</Text>
          )}
        </View>

        <Text style={styles.h2}>Thông tin</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Máy chủ</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {apiBaseUrl || 'chưa cấu hình'}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={hoiDangXuat}
          style={({ pressed }) => [styles.logout, pressed && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  divider,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        divider && styles.menuDivider,
        pressed && { opacity: 0.6 },
      ]}>
      <Ionicons name={icon} size={19} color={colors.brand} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: 12 },
  h1: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  h2: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 8 },

  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  name: { fontSize: 17, fontWeight: '900', color: colors.text },
  email: { fontSize: 12.5, color: colors.muted, marginTop: 2 },

  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
  },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  menuDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },

  rutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rutDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  rutAmount: { fontSize: 15, fontWeight: '900', color: colors.text },
  rutMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  rutStatus: { fontSize: 11, fontWeight: '800', color: colors.muted },
  emptyRow: { fontSize: 13, color: colors.muted, paddingVertical: 18 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  infoLabel: { fontSize: 13, color: colors.muted },
  infoValue: { fontSize: 12.5, fontWeight: '700', color: colors.text, flexShrink: 1 },

  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    height: 50,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  logoutText: { color: colors.danger, fontWeight: '800', fontSize: 14.5 },
});
