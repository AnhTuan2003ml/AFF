import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { guiDoiMaGioiThieu, layGioiThieu } from '@/api/features';
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
  const qc = useQueryClient();
  const [maMoi, setMaMoi] = useState('');
  const { data, isPending } = useQuery({
    queryKey: ['referrals'],
    queryFn: layGioiThieu,
    enabled: !!user,
  });

  // Đối tác/KOL đổi mã 1 lần — gửi yêu cầu, admin duyệt xong sẽ có thông báo.
  const doiMa = useMutation({
    mutationFn: guiDoiMaGioiThieu,
    onSuccess: () => {
      setMaMoi('');
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      Alert.alert('Đã gửi yêu cầu', 'Admin duyệt xong bạn sẽ nhận được thông báo.');
    },
    onError: (e) => {
      // Refetch cả khi lỗi: nếu lỗi là "đã có yêu cầu đang chờ" thì màn hình
      // phải nhảy sang trạng thái ⏳ thay vì tiếp tục chìa form ra.
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      Alert.alert('Chưa gửi được', e instanceof Error ? e.message : 'Thử lại nhé.');
    },
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
            <View style={styles.codeHead}>
              <Text style={styles.codeLabel}>Mã giới thiệu của bạn</Text>
              {data?.codeState?.isPartner && (
                <View style={styles.partnerBadge}>
                  <Ionicons name="star" size={11} color={colors.onBrand} />
                  <Text style={styles.partnerBadgeText}>Đối tác</Text>
                </View>
              )}
            </View>
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

          {data?.codeState?.isPartner && (
            <View style={styles.partnerBox}>
              <Text style={styles.partnerTitle}>Đổi mã giới thiệu tự chọn</Text>
              {data.codeState.pendingCode ? (
                <Text style={styles.partnerNote}>
                  ⏳ Yêu cầu đổi sang mã <Text style={styles.b}>{data.codeState.pendingCode}</Text> đang
                  chờ admin duyệt. Có kết quả bạn sẽ nhận thông báo ngay.
                </Text>
              ) : data.codeState.customized ? (
                <Text style={styles.partnerNote}>
                  ✓ Bạn đã dùng quyền đổi mã (mỗi đối tác được đổi 1 lần). Dữ liệu và link cũ vẫn
                  quy về bạn.
                </Text>
              ) : (
                <>
                  <Text style={styles.partnerNote}>
                    Bạn được đổi mã <Text style={styles.b}>một lần duy nhất</Text>: 3–9 ký tự chữ và
                    số (VD: NamDong). Mã có hiệu lực sau khi admin phê duyệt; dữ liệu giới thiệu cũ
                    giữ nguyên.
                  </Text>
                  <View style={styles.partnerForm}>
                    <TextInput
                      value={maMoi}
                      onChangeText={setMaMoi}
                      placeholder="Mã mới (3–9 chữ/số)"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={9}
                      style={styles.partnerInput}
                    />
                    <Pressable
                      onPress={() => maMoi.trim() && doiMa.mutate(maMoi.trim())}
                      disabled={doiMa.isPending || !maMoi.trim()}
                      style={({ pressed }) => [
                        styles.partnerSubmit,
                        (pressed || doiMa.isPending) && { opacity: 0.7 },
                      ]}>
                      <Text style={styles.partnerSubmitText}>
                        {doiMa.isPending ? 'Đang gửi…' : 'Gửi admin duyệt'}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}

          {data && !data.hasReferrer && (
            <Pressable
              onPress={() => router.push('/nhap-gioi-thieu')}
              style={({ pressed }) => [styles.enterCodeRow, pressed && { opacity: 0.75 }]}>
              <Ionicons name="gift-outline" size={18} color={colors.brand} />
              <Text style={styles.enterCodeText}>
                Bạn có mã giới thiệu? <Text style={styles.b}>Nhập tại đây</Text>
              </Text>
            </Pressable>
          )}

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
  codeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  partnerBadgeText: { color: colors.onBrand, fontSize: 11, fontWeight: '800' },
  partnerBox: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: 12,
  },
  partnerTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  partnerNote: { fontSize: 12.5, color: colors.muted, lineHeight: 19, marginTop: 6 },
  b: { fontWeight: '900', color: colors.text },
  enterCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
    marginBottom: 12,
  },
  enterCodeText: { fontSize: 13.5, color: colors.text },
  // Ô nhập một hàng full chiều ngang, nút gửi nằm hàng riêng bên dưới.
  partnerForm: { gap: 10, marginTop: 10 },
  partnerInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.paper,
  },
  partnerSubmit: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerSubmitText: { color: colors.onBrand, fontWeight: '800', fontSize: 13 },
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
