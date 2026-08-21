import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { layGioiThieu } from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { FormScreen } from '@/components/FormScreen';
import { useSession } from '@/hooks/useSession';
import { ngay, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Giới thiệu — mã mời, tổng thưởng và danh sách người đã mời.
 *
 * Mã mời lấy từ `users.referral_code` — KHÔNG phải `tracking_code`. Hai cột
 * khác nhau: `tracking_code` đi vào Sub ID để quy kết đơn, còn đăng ký tra
 * người giới thiệu bằng `referral_code`.
 */
export default function ReferralsScreen() {
  const { user } = useSession();
  const { data, isPending } = useQuery({
    queryKey: ['referrals'],
    queryFn: layGioiThieu,
    enabled: !!user,
  });

  async function chep() {
    if (!data?.referralCode) return;
    await Clipboard.setStringAsync(data.referralCode);
    Alert.alert('Đã sao chép', 'Gửi mã này cho bạn bè để họ nhập lúc đăng ký.');
  }

  if (!user) return <CanDangNhap mo_ta="Đăng nhập để lấy mã mời và theo dõi thưởng giới thiệu." />;

  return (
    <FormScreen title="Giới thiệu" subtitle="Mời bạn bè dùng ShopTik để cùng nhận thưởng.">
      {isPending ? (
        <Text style={styles.loading}>Đang tải…</Text>
      ) : (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Mã giới thiệu của bạn</Text>
            <View style={styles.codeRow}>
              <Text style={styles.code}>{data?.referralCode ?? '—'}</Text>
              <Pressable
                onPress={chep}
                disabled={!data?.referralCode}
                style={({ pressed }) => [styles.copy, pressed && { opacity: 0.7 }]}>
                <Ionicons name="copy-outline" size={17} color={colors.onBrand} />
                <Text style={styles.copyText}>Chép</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Tổng thưởng đã nhận</Text>
            <Text style={styles.totalValue}>{vnd(data?.totalEarnedVnd)}</Text>
          </View>

          <Text style={styles.h2}>Người bạn đã mời ({data?.data.length ?? 0})</Text>
          {(data?.data.length ?? 0) === 0 ? (
            <Text style={styles.empty}>
              Chưa có ai dùng mã của bạn. Gửi mã cho bạn bè để bắt đầu.
            </Text>
          ) : (
            data!.data.map((r, i) => (
              <View key={`${r.fullName}-${i}`} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(r.fullName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.fullName || 'Người dùng'}</Text>
                  <Text style={styles.meta}>
                    {r.approvedOrders} đơn đã duyệt · từ {ngay(r.createdAt)}
                  </Text>
                </View>
                <Text style={styles.earned}>{vnd(r.earnedVnd)}</Text>
              </View>
            ))
          )}
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  loading: { fontSize: 13, color: colors.muted, paddingVertical: 20 },
  codeBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
    marginBottom: 12,
  },
  codeLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  code: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: colors.brand,
    letterSpacing: 1,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  copyText: { color: colors.onBrand, fontWeight: '800', fontSize: 13 },

  totalBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.successSoft,
    marginBottom: spacing.lg,
  },
  totalLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  totalValue: { fontSize: 24, fontWeight: '900', color: colors.success, marginTop: 4 },

  h2: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 8 },
  empty: { fontSize: 13, color: colors.muted, lineHeight: 20, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.brand, fontWeight: '900', fontSize: 15 },
  name: { fontSize: 14, fontWeight: '800', color: colors.text },
  meta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  earned: { fontSize: 14, fontWeight: '900', color: colors.success },
});
