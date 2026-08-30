import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as Clipboard from 'expo-clipboard';

import { layLenhRut } from '@/api/account';
import { layGioiThieu } from '@/api/features';
import { apiBaseUrl } from '@/api/client';
import { BrandHeader } from '@/components/BrandHeader';
import { CanDangNhap } from '@/components/CanDangNhap';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useT } from '@/i18n';
import { Mascot } from '@/components/Mascot';
import { CAMIO_VOICE } from '@/lib/camio-voice';
import { useSession } from '@/hooks/useSession';
import { ngay, vnd } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

export default function AccountScreen() {
  const { user, dangXuat } = useSession();
  const t = useT();
  const [hoiXuat, setHoiXuat] = useState(false);

  const { data: lenhRut } = useQuery({
    queryKey: ['withdrawals'],
    queryFn: layLenhRut,
    enabled: !!user,
  });
  // Mã giới thiệu hiện ngay dưới khối tài khoản, kèm nút chép nhanh.
  const { data: gioiThieu } = useQuery({
    queryKey: ['referrals'],
    queryFn: layGioiThieu,
    enabled: !!user,
  });

  async function chepMa() {
    const ma = gioiThieu?.referralCode;
    if (!ma) return;
    await Clipboard.setStringAsync(ma);
    Alert.alert('Đã sao chép', 'Gửi mã này cho bạn bè để họ nhập lúc đăng ký.');
  }

  if (!user) {
    return (
      <View style={styles.screen}>
        <BrandHeader />
        <CanDangNhap
          mo_ta={t(
            'Đăng nhập để xem hồ sơ, tài khoản ngân hàng nhận tiền và lịch sử rút.',
            'Sign in to view your profile, payout bank account and withdrawal history.',
          )}
        />
      </View>
    );
  }

  function hoiDangXuat() {
    setHoiXuat(true);
  }

  return (
    <View style={styles.screen}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>{t('Tài khoản', 'Account')}</Text>

        <View style={styles.profile}>
          {user.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.fullName || user.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.fullName || t('Chưa đặt tên', 'No name yet')}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>
        </View>

        {/* Mã giới thiệu ngay dưới khối tài khoản + nút chép — vào tab là thấy. */}
        <Pressable
          onPress={() => router.push('/referrals')}
          style={({ pressed }) => [styles.refBox, pressed && { opacity: 0.85 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.refLabel}>{t('Mã giới thiệu của bạn', 'Your referral code')}</Text>
            <Text style={styles.refCode}>{gioiThieu?.referralCode ?? '…'}</Text>
          </View>
          <Pressable
            onPress={chepMa}
            disabled={!gioiThieu?.referralCode}
            hitSlop={8}
            style={({ pressed }) => [styles.refCopy, pressed && { opacity: 0.7 }]}>
            <Ionicons name="copy-outline" size={16} color={colors.onBrand} />
            <Text style={styles.refCopyText}>{t('Chép', 'Copy')}</Text>
          </Pressable>
        </Pressable>

        <View style={[styles.card, styles.langCard]}>
          <LanguageToggle />
        </View>

        <Text style={styles.h2}>{t('Thao tác', 'Actions')}</Text>
        <View style={styles.card}>
          <MenuRow
            icon="person-outline"
            label={t('Thông tin cá nhân', 'Personal info')}
            onPress={() => router.push('/profile')}
          />
          <MenuRow
            icon="card-outline"
            label={t('Tài khoản ngân hàng', 'Bank account')}
            onPress={() => router.push('/bank')}
            divider
          />
          <MenuRow
            icon="arrow-up-circle-outline"
            label={t('Rút tiền', 'Withdraw')}
            onPress={() => router.push('/withdraw')}
            divider
          />
          <MenuRow
            icon="flag-outline"
            label={t('Nhiệm vụ nhận thưởng', 'Rewards & missions')}
            onPress={() => router.push('/missions')}
            divider
          />
          <MenuRow
            icon="share-social-outline"
            label={t('Chia sẻ nhận hoa hồng', 'Share for commission')}
            onPress={() => router.push('/chia-se')}
            divider
          />
          <MenuRow
            icon="ribbon-outline"
            label={t('Đăng ký KOL/KOC', 'Become a KOL/KOC')}
            onPress={() => router.push('/kol')}
            divider
          />
          <MenuRow
            icon="people-outline"
            label={t('Giới thiệu bạn bè', 'Refer friends')}
            onPress={() => router.push('/referrals')}
            divider
          />
          <MenuRow
            icon="chatbubbles-outline"
            label={t('Hỗ trợ & khiếu nại', 'Support & complaints')}
            onPress={() => router.push('/support')}
            divider
          />
        </View>

        <Text style={styles.h2}>{t('Lệnh rút gần đây', 'Recent withdrawals')}</Text>
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
            <Text style={styles.emptyRow}>{t('Chưa có lệnh rút nào.', 'No withdrawals yet.')}</Text>
          )}
        </View>

        <Text style={styles.h2}>{t('Pháp lý & quyền riêng tư', 'Legal & privacy')}</Text>
        <View style={styles.card}>
          <MenuRow
            icon="reader-outline"
            label={t('Xem lại tài khoản', 'Account review')}
            onPress={() => router.push('/account-review')}
          />
          <MenuRow
            icon="lock-closed-outline"
            label={t('Quyền riêng tư', 'Privacy')}
            onPress={() => router.push('/privacy')}
            divider
          />
          <MenuRow
            icon="alert-circle-outline"
            label={t('Tuyên bố miễn trừ', 'Disclaimer')}
            onPress={() => router.push('/disclaimer')}
            divider
          />
          <MenuRow
            icon="trash-outline"
            label={t('Xóa tài khoản', 'Delete account')}
            onPress={() => router.push('/delete-account')}
            divider
          />
        </View>

        <Text style={styles.h2}>{t('Thông tin', 'Info')}</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('Máy chủ', 'Server')}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>
              {apiBaseUrl || t('chưa cấu hình', 'not configured')}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={hoiDangXuat}
          style={({ pressed }) => [styles.logout, pressed && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="log-out-outline" size={19} color={colors.danger} />
          <Text style={styles.logoutText}>{t('Đăng xuất', 'Sign out')}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={hoiXuat}
        transparent
        animationType="fade"
        onRequestClose={() => setHoiXuat(false)}>
        <Pressable style={styles.scrim} onPress={() => setHoiXuat(false)}>
          <Pressable style={styles.confirm} onPress={(e) => e.stopPropagation()}>
            <Mascot mood="ngacnhien" size={64} />
            <Text style={styles.confirmTitle}>{t('Đăng xuất?', 'Sign out?')}</Text>
            <Text style={styles.confirmSub}>{CAMIO_VOICE.logoutStay[0]}</Text>
            <Pressable
              style={({ pressed }) => [styles.confirmDanger, pressed && { opacity: 0.9 }]}
              onPress={() => {
                setHoiXuat(false);
                void dangXuat();
              }}>
              <Text style={styles.confirmDangerText}>{t('Đăng xuất', 'Sign out')}</Text>
            </Pressable>
            <Pressable style={styles.confirmGhost} onPress={() => setHoiXuat(false)}>
              <Text style={styles.confirmGhostText}>{t('Ở lại', 'Stay')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.lineStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: 12 },
  h1: { fontSize: 25, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  h2: { fontSize: 14, fontWeight: '800', color: colors.inkSoft, marginTop: 8, letterSpacing: 0.2 },

  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  refBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  refLabel: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
  refCode: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.brand,
    letterSpacing: 1,
    marginTop: 2,
  },
  refCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  refCopyText: { color: colors.onBrand, fontWeight: '800', fontSize: 13 },
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
    ...shadow.card,
  },
  langCard: { paddingVertical: 14, marginBottom: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 13 },
  menuDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },

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

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(40,22,14,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  confirm: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 6,
  },
  confirmTitle: { fontSize: 19, fontWeight: '900', color: colors.text, marginTop: 6 },
  confirmSub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19, marginBottom: 10 },
  confirmDanger: {
    width: '100%',
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDangerText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  confirmGhost: { width: '100%', height: 44, alignItems: 'center', justifyContent: 'center' },
  confirmGhostText: { color: colors.muted, fontWeight: '800', fontSize: 14 },
});
