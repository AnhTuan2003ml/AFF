import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import * as Clipboard from 'expo-clipboard';

import { layMe } from '@/api/account';
import { layGioiThieu } from '@/api/features';
import { apiBaseUrl } from '@/api/client';
import { BrandHeader } from '@/components/BrandHeader';
import { CanDangNhap } from '@/components/CanDangNhap';
import { useT } from '@/i18n';
import { Mascot } from '@/components/Mascot';
import { camioAt } from '@/lib/camio-voice';
import { useSession } from '@/hooks/useSession';
import { vnd } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Tab "Tài khoản" — dựng lại hub /app/settings của web ở khổ điện thoại.
 * Bố cục và danh sách bám đúng views/app/settings.njk: hồ sơ (kèm số dư) → mã
 * giới thiệu (kèm link đăng ký) → các nhóm chức năng: Tài khoản · Tiền và đơn
 * hàng · Kiếm thêm · (lệnh rút gần đây) · Hỗ trợ & pháp lý → Đăng xuất.
 */
export default function AccountScreen() {
  const { user, dangXuat } = useSession();
  const t = useT();
  const [hoiXuat, setHoiXuat] = useState(false);
  const laQuanTri = !!user && user.role !== 'USER';

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: layMe, enabled: !!user });
  const { data: gioiThieu } = useQuery({
    queryKey: ['referrals'],
    queryFn: layGioiThieu,
    enabled: !!user,
  });

  const maGioiThieu = gioiThieu?.referralCode ?? null;
  const goc = apiBaseUrl || 'https://shoptikvn.com';
  const linkDangKy = maGioiThieu ? `${goc}/dang-ky?ref=${maGioiThieu}` : null;

  async function chep(giaTri: string | null, thongBao: string) {
    if (!giaTri) return;
    await Clipboard.setStringAsync(giaTri);
    Alert.alert(t('Đã sao chép', 'Copied'), thongBao);
  }

  function moQuanTri() {
    void WebBrowser.openBrowserAsync(`${goc}/backoffice/console`);
  }

  function moChinhSach() {
    void WebBrowser.openBrowserAsync(`${goc}/chinh-sach-nguoi-dung`);
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

  return (
    <View style={styles.screen}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>{t('Tài khoản', 'Account')}</Text>

        {/* Hồ sơ — bấm vào mở Thông tin cá nhân (giống web: cả khối là link). */}
        <Pressable
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.profile, pressed && { opacity: 0.9 }]}>
          {user.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user.fullName || user.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {user.fullName || t('Tài khoản ShopTik', 'ShopTik account')}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.lineStrong} />
        </Pressable>

        {/* Số dư nhanh — Đang chờ / Khả dụng, đúng như web. */}
        {me?.balances ? (
          <View style={styles.balanceRow}>
            <View style={styles.balanceCell}>
              <Text style={styles.balanceLabel}>{t('Đang chờ', 'Pending')}</Text>
              <Text style={styles.balancePending}>{vnd(me.balances.pending)}</Text>
            </View>
            <View style={styles.balanceSep} />
            <View style={styles.balanceCell}>
              <Text style={styles.balanceLabel}>{t('Khả dụng', 'Available')}</Text>
              <Text style={styles.balanceValue}>{vnd(me.balances.available)}</Text>
            </View>
          </View>
        ) : null}

        {/* Mã giới thiệu + link đăng ký (mỗi dòng có nút chép) — như web. */}
        <View style={styles.refBox}>
          <Text style={styles.refLabel}>{t('Mã giới thiệu của bạn', 'Your referral code')}</Text>
          <View style={styles.refFieldRow}>
            <Text style={styles.refCode}>{maGioiThieu ?? '…'}</Text>
            <Pressable
              onPress={() =>
                chep(
                  maGioiThieu,
                  t(
                    'Gửi mã này cho bạn bè để họ nhập lúc đăng ký.',
                    'Send this code to friends to enter at sign-up.',
                  ),
                )
              }
              disabled={!maGioiThieu}
              hitSlop={6}
              style={({ pressed }) => [styles.refCopy, pressed && { opacity: 0.7 }]}>
              <Ionicons name="copy-outline" size={15} color={colors.onBrand} />
              <Text style={styles.refCopyText}>{t('Chép', 'Copy')}</Text>
            </Pressable>
          </View>
          <View style={styles.refLinkRow}>
            <Text style={styles.refLink} numberOfLines={1}>
              {linkDangKy ?? '…'}
            </Text>
            <Pressable
              onPress={() =>
                chep(linkDangKy, t('Đã chép link đăng ký kèm mã.', 'Sign-up link with code copied.'))
              }
              disabled={!linkDangKy}
              hitSlop={6}
              style={({ pressed }) => [styles.refCopyGhost, pressed && { opacity: 0.6 }]}>
              <Text style={styles.refCopyGhostText}>{t('Chép link', 'Copy link')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Nhóm 1 — Tài khoản */}
        <Text style={styles.h2}>{t('Tài khoản', 'Account')}</Text>
        <View style={styles.card}>
          <MenuRow
            icon="person-outline"
            label={t('Thông tin cá nhân', 'Personal info')}
            onPress={() => router.push('/profile')}
          />
          <MenuRow
            icon="card-outline"
            label={t('Tài khoản nhận tiền', 'Payout account')}
            onPress={() => router.push('/bank')}
            divider
          />
        </View>

        {/* Nhóm 2 — Tiền và đơn hàng */}
        <Text style={styles.h2}>{t('Tiền và đơn hàng', 'Money & orders')}</Text>
        <View style={styles.card}>
          <MenuRow
            icon="wallet-outline"
            label={t('Số dư & lịch sử ví', 'Balance & wallet history')}
            onPress={() => router.push('/(tabs)/wallet')}
          />
          <MenuRow
            icon="arrow-up-circle-outline"
            label={t('Rút tiền về ngân hàng', 'Withdraw to bank')}
            onPress={() => router.push('/withdraw')}
            divider
          />
          <MenuRow
            icon="receipt-outline"
            label={t('Đơn hàng & đối soát', 'Orders & reconciliation')}
            onPress={() => router.push('/(tabs)/orders')}
            divider
          />
          <MenuRow
            icon="flag-outline"
            label={t('Nhiệm vụ nhận thưởng', 'Rewards & missions')}
            onPress={() => router.push('/missions')}
            divider
          />
        </View>

        {/* Nhóm 3 — Kiếm thêm */}
        <Text style={styles.h2}>{t('Kiếm thêm', 'Earn more')}</Text>
        <View style={styles.card}>
          <MenuRow
            icon="link-outline"
            label={t('Link chia sẻ', 'Share links')}
            onPress={() => router.push('/chia-se')}
          />
          <MenuRow
            icon="people-outline"
            label={t('Giới thiệu bạn bè', 'Refer friends')}
            onPress={() => router.push('/referrals')}
            divider
          />
          <MenuRow
            icon="ribbon-outline"
            label={t('Đăng ký KOL/KOC', 'Become a KOL/KOC')}
            onPress={() => router.push('/kol')}
            divider
          />
          <MenuRow
            icon="compass-outline"
            label={t('Khám phá ưu đãi', 'Explore deals')}
            onPress={() => router.push('/(tabs)/discover')}
            divider
          />
        </View>

        {/* Nhóm 4 — Khác (1:1 với web settings.njk). Xóa tài khoản nằm trong
            "Thông tin cá nhân" (giống web đặt trong /app/profile). */}
        <Text style={styles.h2}>{t('Khác', 'More')}</Text>
        <View style={styles.card}>
          <MenuRow
            icon="chatbubbles-outline"
            label={t('Hỗ trợ & khiếu nại', 'Support & complaints')}
            onPress={() => router.push('/support')}
          />
          <MenuRow
            icon="document-text-outline"
            label={t('Chính sách người dùng', 'User Policy')}
            onPress={moChinhSach}
            divider
          />
          {laQuanTri ? (
            <MenuRow
              icon="shield-checkmark-outline"
              label={t('Mở trang quản trị', 'Open admin console')}
              onPress={moQuanTri}
              divider
            />
          ) : null}
          <MenuRow
            icon="log-out-outline"
            label={t('Đăng xuất', 'Sign out')}
            onPress={() => setHoiXuat(true)}
            divider
            danger
          />
        </View>
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
            <Text style={styles.confirmSub}>{camioAt('logoutStay', 0)}</Text>
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
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  divider?: boolean;
  danger?: boolean;
}) {
  const mau = danger ? colors.danger : colors.brand;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        divider && styles.menuDivider,
        pressed && { opacity: 0.6 },
      ]}>
      <View style={[styles.menuIcon, danger && { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name={icon} size={18} color={mau} />
      </View>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
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

  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingVertical: 14,
    ...shadow.card,
  },
  balanceCell: { flex: 1, alignItems: 'center', gap: 3 },
  balanceSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.line },
  balanceLabel: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
  balancePending: { fontSize: 16, fontWeight: '900', color: colors.warning },
  balanceValue: { fontSize: 16, fontWeight: '900', color: colors.success },

  refBox: {
    gap: 10,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandLine,
  },
  refLabel: { fontSize: 11.5, color: colors.muted, fontWeight: '700' },
  refFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  refCode: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: colors.brand,
    letterSpacing: 1,
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
  refLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.brandLine,
  },
  refLink: { flex: 1, fontSize: 12.5, color: colors.inkSoft, fontWeight: '600' },
  refCopyGhost: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  refCopyGhostText: { color: colors.brand, fontWeight: '800', fontSize: 12.5 },

  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    ...shadow.card,
  },
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
