import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { guiDoiMaGioiThieu, layGioiThieu } from '@/api/features';
import { CanDangNhap } from '@/components/CanDangNhap';
import { FormScreen } from '@/components/FormScreen';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { ngay, vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';


/** Gọn tiền cho nhãn trục: 500000→"500k", 1000000→"1tr". */

/**
 * Giới thiệu — mã mời, tổng thưởng và danh sách người đã mời.
 *
 * Mã mời lấy từ `users.referral_code` — KHÔNG phải `tracking_code`. Hai cột
 * khác nhau: `tracking_code` đi vào Sub ID để quy kết đơn, còn đăng ký tra
 * người giới thiệu bằng `referral_code`.
 */
export default function ReferralsScreen() {
  const t = useT();
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
      Alert.alert(t('Đã gửi yêu cầu', 'Request sent'), t('Admin duyệt xong bạn sẽ nhận được thông báo.', "You'll be notified once an admin approves it."));
    },
    onError: (e) => {
      // Refetch cả khi lỗi: nếu lỗi là "đã có yêu cầu đang chờ" thì màn hình
      // phải nhảy sang trạng thái ⏳ thay vì tiếp tục chìa form ra.
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      Alert.alert(t('Chưa gửi được', "Couldn't send"), e instanceof Error ? e.message : t('Thử lại nhé.', 'Please try again.'));
    },
  });

  async function chep() {
    if (!data?.referralCode) return;
    await Clipboard.setStringAsync(data.referralCode);
    Alert.alert(t('Đã sao chép', 'Copied'), t('Gửi mã này cho bạn bè để họ nhập lúc đăng ký.', 'Share this code with friends to enter when they sign up.'));
  }

  if (!user) return <CanDangNhap mo_ta={t('Đăng nhập để lấy mã mời và theo dõi thưởng giới thiệu.', 'Log in to get your invite code and track referral rewards.')} />;

  return (
    <FormScreen title={t('Giới thiệu', 'Referrals')} subtitle={t('Mời bạn bè dùng ShopTik để cùng nhận thưởng.', 'Invite friends to use ShopTik and earn rewards together.')}>
      {isPending ? (
        <Text style={styles.loading}>{t('Đang tải…', 'Loading…')}</Text>
      ) : (
        <>
          <View style={styles.invitedCard}>
            <View style={styles.invitedHead}>
              <Text style={styles.invitedTitle}>{t('Người bạn đã mời', 'People you invited')}</Text>
              <Text style={styles.invitedCount}>{data?.data.length ?? 0} {t('người', 'people')}</Text>
            </View>
            {(data?.data.length ?? 0) === 0 ? (
              <View style={styles.invitedEmpty}>
                <Text style={styles.invitedEmptyTitle}>{t('Chưa có ai dùng mã của bạn', 'No one has used your code yet')}</Text>
                <Text style={styles.invitedEmptyText}>
                  {t('Chép mã và gửi cho bạn bè để bắt đầu tích lũy thưởng.', 'Copy your code and share it with friends to start earning rewards.')}
                </Text>
                <Pressable onPress={chep} style={({ pressed }) => [styles.invitedCta, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.invitedCtaText}>{t('Mời ngay', 'Invite now')}</Text>
                </Pressable>
              </View>
            ) : (
              data!.data.map((r, i) => (
                <View key={`${r.fullName}-${i}`} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(r.fullName || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{r.fullName || t('Người dùng', 'User')}</Text>
                    <Text style={styles.meta}>
                      {r.approvedOrders} {t('đơn đã duyệt', 'approved orders')} · {t('từ', 'from')} {ngay(r.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.earned}>{vnd(r.earnedVnd)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.codeBox}>
            <View style={styles.codeHead}>
              <Text style={styles.codeLabel}>{t('Mã giới thiệu của bạn', 'Your referral code')}</Text>
              {data?.codeState?.isPartner && (
                <View style={styles.partnerBadge}>
                  <Ionicons name="star" size={11} color={colors.onBrand} />
                  <Text style={styles.partnerBadgeText}>{t('Đối tác', 'Partner')}</Text>
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
                <Text style={styles.copyText}>{t('Chép', 'Copy')}</Text>
              </Pressable>
            </View>
          </View>

          {data?.codeState?.isPartner && (
            <View style={styles.partnerBox}>
              <Text style={styles.partnerTitle}>{t('Đổi mã giới thiệu tự chọn', 'Choose a custom referral code')}</Text>
              {data.codeState.pendingCode ? (
                <Text style={styles.partnerNote}>
                  {t('⏳ Yêu cầu đổi sang mã ', '⏳ Your request to change to code ')}
                  <Text style={styles.b}>{data.codeState.pendingCode}</Text>
                  {t(
                    ' đang chờ admin duyệt. Có kết quả bạn sẽ nhận thông báo ngay.',
                    ' is pending admin approval. You will be notified as soon as there is a result.',
                  )}
                </Text>
              ) : data.codeState.customized ? (
                <Text style={styles.partnerNote}>
                  {t(
                    '✓ Bạn đã dùng quyền đổi mã (mỗi đối tác được đổi 1 lần). Dữ liệu và link cũ vẫn quy về bạn.',
                    '✓ You have used your code-change right (each partner may change once). Your old data and links still credit to you.',
                  )}
                </Text>
              ) : (
                <>
                  <Text style={styles.partnerNote}>
                    {t('Bạn được đổi mã ', 'You may change your code ')}
                    <Text style={styles.b}>{t('một lần duy nhất', 'only once')}</Text>
                    {t(
                      ': 3–9 ký tự chữ và số (VD: NamDong). Mã có hiệu lực sau khi admin phê duyệt; dữ liệu giới thiệu cũ giữ nguyên.',
                      ': 3–9 alphanumeric characters (e.g. NamDong). It takes effect after admin approval; your existing referral data is preserved.',
                    )}
                  </Text>
                  <View style={styles.partnerForm}>
                    <TextInput
                      value={maMoi}
                      onChangeText={setMaMoi}
                      placeholder={t('Mã mới (3–9 chữ/số)', 'New code (3–9 letters/digits)')}
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
                        {doiMa.isPending ? t('Đang gửi…', 'Sending…') : t('Gửi admin duyệt', 'Submit for approval')}
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
                {t('Bạn có mã giới thiệu? ', 'Have a referral code? ')}
                <Text style={styles.b}>{t('Nhập tại đây', 'Enter it here')}</Text>
              </Text>
            </Pressable>
          )}

          {data?.hasReferrer && data.referrer && (
            <View style={styles.referrerCard}>
              <View style={styles.referrerAvatar}>
                {data.referrer.avatarUrl ? (
                  <Image source={{ uri: data.referrer.avatarUrl }} style={styles.referrerAvatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.referrerAvatarText}>
                    {(data.referrer.fullName || '?').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.referrerLabel}>{t('Người giới thiệu bạn', 'Who referred you')}</Text>
                <Text style={styles.referrerName} numberOfLines={1}>
                  {data.referrer.fullName || t('Đối tác ShopTik', 'ShopTik partner')}
                </Text>
                {data.referrer.referralCode ? (
                  <Text style={styles.referrerCode}>{t('Mã', 'Code')}: {data.referrer.referralCode}</Text>
                ) : null}
              </View>
              <View style={styles.referrerLocked}>
                <Text style={styles.referrerLockedText}>{t('Đã ghi nhận', 'Locked')}</Text>
              </View>
            </View>
          )}

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>{t('Tổng thưởng đã nhận', 'Total rewards earned')}</Text>
            <Text style={styles.totalValue}>{vnd(data?.totalEarnedVnd)}</Text>
          </View>

          <Pressable style={styles.revenueLink} onPress={() => router.push('/doanh-thu' as unknown as Href)}>
            <Ionicons name="stats-chart-outline" size={18} color={colors.brand} />
            <Text style={styles.revenueLinkText}>{t('Xem báo cáo doanh thu', 'View revenue report')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  loading: { fontSize: 13, color: colors.muted, paddingVertical: 20 },
  invitedCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: 12,
  },
  invitedHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  invitedTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  invitedCount: { fontSize: 12.5, fontWeight: '800', color: colors.brand },
  invitedEmpty: { alignItems: 'center', paddingVertical: 12 },
  invitedEmptyTitle: { fontSize: 14, fontWeight: '900', color: colors.text, textAlign: 'center' },
  invitedEmptyText: { fontSize: 12.5, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 14, lineHeight: 18 },
  invitedCta: {
    paddingHorizontal: 22,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invitedCtaText: { color: colors.onBrand, fontWeight: '800', fontSize: 14 },
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
  referrerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: 12,
  },
  referrerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referrerAvatarImg: { width: '100%', height: '100%' },
  referrerAvatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  referrerLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.3, textTransform: 'uppercase' },
  referrerName: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 1 },
  referrerCode: { fontSize: 12, color: colors.muted, marginTop: 1 },
  referrerLocked: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
  },
  referrerLockedText: { fontSize: 10.5, fontWeight: '800', color: colors.success },
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
  revenueLink: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14,
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.surface,
  },
  revenueLinkText: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },

  chartCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: spacing.lg,
  },
  chartTitle: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  yAxis: { height: 120, justifyContent: 'space-between', alignItems: 'flex-end' },
  yLabel: { fontSize: 9, color: colors.muted },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    width: '68%',
    height: 120,
    justifyContent: 'flex-end',
    backgroundColor: colors.paper,
    borderRadius: 4,
  },
  barFill: {
    width: '100%',
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  barMonth: { fontSize: 9.5, color: colors.muted, marginTop: 5 },

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
