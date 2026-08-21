import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
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

import { layVi, type LedgerRow } from '@/api/account';
import { BrandHeader } from '@/components/BrandHeader';
import { CanDangNhap } from '@/components/CanDangNhap';
import { useSession } from '@/hooks/useSession';
import { ngayGio, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Ví — hai số dư và sổ bút toán.
 *
 * Hai số dư tách bạch có lý do nghiệp vụ, giữ đúng cách gọi tên của web:
 *   CHỜ      tiền hoàn của đơn đã xong nhưng còn trong thời gian giữ
 *   KHẢ DỤNG tiền đã qua thời gian giữ, rút được
 * Gộp hai số này lại là hứa với người dùng số tiền họ chưa rút được.
 */
export default function WalletScreen() {
  const { user } = useSession();

  const { data, isPending, isRefetching, refetch } = useQuery({
    queryKey: ['wallet'],
    queryFn: layVi,
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <BrandHeader />
        <CanDangNhap mo_ta="Đăng nhập để xem số dư hoàn tiền và lịch sử biến động ví." />
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
          data={data?.history ?? []}
          // Một giao dịch ledger có thể có nhiều vế thuộc cùng người dùng (vd
          // đảo khoản: DEBIT + CREDIT), nên t.id không duy nhất giữa các dòng —
          // ghép thêm chỉ số để FlatList không cảnh báo trùng key.
          keyExtractor={(r, i) => `${r.id}-${r.direction}-${i}`}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />
          }
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>Có thể rút</Text>
                <Text style={styles.heroValue}>{vnd(data?.balances.available)}</Text>
                <Text style={styles.heroNote}>
                  Khoản đã được đối tác duyệt và chưa giữ cho lệnh rút.
                </Text>
                <Pressable
                  onPress={() => router.push('/withdraw')}
                  style={({ pressed }) => [
                    styles.heroBtn,
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text style={styles.heroBtnText}>Rút tiền  →</Text>
                </Pressable>
              </View>

              {/* Dòng tiền hoàn: Đang chờ → Có thể rút → Đã nhận (như web). */}
              <View style={styles.flow}>
                <View style={[styles.step, styles.stepWait]}>
                  <Text style={styles.stepLabel}>Đang chờ đối soát</Text>
                  <Text style={styles.stepValue}>{vnd(data?.balances.pending)}</Text>
                  <Text style={styles.stepNote}>Đơn chưa được sàn duyệt</Text>
                </View>
                <View style={[styles.step, styles.stepReady]}>
                  <Text style={styles.stepLabel}>Có thể rút</Text>
                  <Text style={styles.stepValue}>{vnd(data?.balances.available)}</Text>
                  <Text style={styles.stepNote}>
                    {(data?.balances.held ?? 0) > 0
                      ? `Đang xử lý: ${vnd(data?.balances.held)}`
                      : 'Sẵn sàng tạo lệnh rút'}
                  </Text>
                </View>
                <View style={[styles.step, styles.stepPaid]}>
                  <Text style={styles.stepLabel}>Đã nhận</Text>
                  <Text style={styles.stepValue}>{vnd(data?.balances.paid)}</Text>
                  <Text style={styles.stepNote}>Đã chuyển về ngân hàng</Text>
                </View>
              </View>

              <View>
                <Text style={styles.eyebrow}>NHẬT KÝ</Text>
                <Text style={styles.h2}>Lịch sử biến động</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Chưa có biến động nào trong ví.</Text>
          }
          renderItem={({ item }) => <DongSo row={item} />}
        />
      )}
    </View>
  );
}

function DongSo({ row }: { row: LedgerRow }) {
  // CREDIT vào tài khoản người dùng = tiền vào. DEBIT = tiền ra (rút, đảo khoản).
  const vao = row.direction === 'CREDIT';
  return (
    <View style={styles.entry}>
      <View style={[styles.entryIcon, { backgroundColor: vao ? colors.successSoft : colors.dangerSoft }]}>
        <Ionicons
          name={vao ? 'arrow-down' : 'arrow-up'}
          size={15}
          color={vao ? colors.success : colors.danger}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.entryTitle} numberOfLines={2}>
          {row.description ?? row.type}
        </Text>
        <Text style={styles.entryTime}>{ngayGio(row.created_at)}</Text>
      </View>
      <Text style={[styles.entryAmount, { color: vao ? colors.success : colors.danger }]}>
        {vao ? '+' : '−'}
        {vnd(row.amount_vnd)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.md, paddingBottom: spacing.xl, gap: 10 },
  h1: { fontSize: 28, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  h2: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 2 },
  eyebrow: { fontSize: 10.5, fontWeight: '900', color: colors.brand, letterSpacing: 1.2 },

  hero: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
  },
  heroLabel: { fontSize: 12.5, color: 'rgba(255,255,255,0.88)', fontWeight: '700' },
  heroValue: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.4, marginTop: 4 },
  heroNote: { fontSize: 11.5, color: 'rgba(255,255,255,0.82)', marginTop: 6, lineHeight: 16 },
  heroBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 18,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnText: { color: colors.brand, fontWeight: '900', fontSize: 14 },

  flow: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, padding: 10, borderRadius: radius.md, gap: 2 },
  stepWait: { backgroundColor: colors.warningSoft },
  stepReady: { backgroundColor: colors.brandSoft },
  stepPaid: { backgroundColor: colors.successSoft },
  stepLabel: { fontSize: 10.5, fontWeight: '800', color: colors.inkSoft },
  stepValue: { fontSize: 14, fontWeight: '900', color: colors.text, marginTop: 2 },
  stepNote: { fontSize: 9.5, color: colors.muted, lineHeight: 13, marginTop: 1 },

  balanceMain: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
  },
  balanceMainLabel: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  balanceMainValue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1.4,
    marginTop: 6,
  },

  balancePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  balancePendingLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  balancePendingValue: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 2 },

  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  withdrawText: { color: colors.onBrand, fontWeight: '800', fontSize: 14.5 },

  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  entryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  entryTime: { fontSize: 11, color: colors.muted, marginTop: 2 },
  entryAmount: { fontSize: 14, fontWeight: '900' },

  empty: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingVertical: 30 },
});
