import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layMe } from '@/api/account';
import { apiBaseUrl } from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { vnd } from '@/lib/format';
import { colors, radius, shadow, spacing } from '@/theme/tokens';

/**
 * Thanh trên cùng — dựng lại `.px-header` của web ở khổ điện thoại.
 *
 * Khách:      logo · nút Đăng ký
 * Đã đăng nhập: logo · chuông thông báo · chip số dư · avatar mở menu
 *
 * Menu tài khoản giữ đúng bảy mục của web, kể cả "Trang quản trị" chỉ hiện với
 * tài khoản có vai trò khác USER.
 */
export function BrandHeader({ onRegister }: { onRegister?: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, dangXuat } = useSession();
  const [moMenu, setMoMenu] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: layMe, enabled: !!user });

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable style={styles.brand} onPress={() => router.push('/(tabs)')}>
        <Image
          source={require('../../assets/images/brand-logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.brandText}>ShopTik</Text>
      </Pressable>

      {user ? (
        <View style={styles.right}>
          <Pressable style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="notifications-outline" size={20} color={colors.inkSoft} />
          </Pressable>

          <Pressable style={styles.walletChip} onPress={() => router.push('/(tabs)/wallet')}>
            <Text style={styles.walletChipText}>{vnd(me?.balances.available ?? 0)}</Text>
          </Pressable>

          <Pressable style={styles.avatar} onPress={() => setMoMenu(true)}>
            {user.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.avatarText}>
                {(user.fullName || user.email || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={onRegister ?? (() => router.push('/register'))}
          style={({ pressed }) => [styles.cta, pressed && { backgroundColor: colors.brandStrong }]}>
          <Text style={styles.ctaText}>Đăng ký</Text>
        </Pressable>
      )}

      <MenuTaiKhoan
        mo={moMenu}
        dong={() => setMoMenu(false)}
        laQuanTri={!!user && user.role !== 'USER'}
        onDangXuat={dangXuat}
      />
    </View>
  );
}

function MenuTaiKhoan({
  mo,
  dong,
  laQuanTri,
  onDangXuat,
}: {
  mo: boolean;
  dong: () => void;
  laQuanTri: boolean;
  onDangXuat: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();

  function di(duong: Parameters<typeof router.push>[0]) {
    dong();
    router.push(duong);
  }

  return (
    <Modal visible={mo} transparent animationType="fade" onRequestClose={dong}>
      <Pressable style={styles.scrim} onPress={dong}>
        <Pressable
          style={[styles.menu, { top: insets.top + 56 }]}
          onPress={(e) => e.stopPropagation()}>
          <Muc icon="person-outline" nhan="Thông tin cá nhân" onPress={() => di('/(tabs)/account')} />
          <Muc icon="card-outline" nhan="Tài khoản ngân hàng" onPress={() => di('/bank')} />
          <Muc icon="link-outline" nhan="Giới thiệu bạn bè" onPress={() => di('/referrals')} />
          <Muc icon="calendar-outline" nhan="Điểm danh" onPress={() => di('/checkin')} />
          <Muc icon="flag-outline" nhan="Nhiệm vụ" onPress={() => di('/missions')} />

          {laQuanTri && (
            <Muc
              icon="shield-checkmark-outline"
              nhan="Trang quản trị"
              /*
               * Trung tâm vận hành là giao diện web dày đặc bảng dữ liệu, cố ý
               * không có bản app (xem CLAUDE.md). Mở bằng trình duyệt hệ thống
               * để admin dùng đúng bản web đầy đủ thay vì một bản rút gọn thiếu
               * chức năng.
               */
              onPress={() => {
                dong();
                void WebBrowser.openBrowserAsync(`${apiBaseUrl}/backoffice/console`);
              }}
            />
          )}

          <View style={styles.divider} />
          <Muc
            icon="log-out-outline"
            nhan="Đăng xuất"
            mauDo
            onPress={() => {
              dong();
              void onDangXuat();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Muc({
  icon,
  nhan,
  onPress,
  mauDo,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  nhan: string;
  onPress: () => void;
  mauDo?: boolean;
}) {
  const mau = mauDo ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.muc, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <Ionicons name={icon} size={18} color={mauDo ? colors.danger : colors.brand} />
      <Text style={[styles.mucText, { color: mau }]}>{nhan}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 34, height: 34 },
  brandText: { fontSize: 21, fontWeight: '900', letterSpacing: -1, color: colors.brand },

  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  walletChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  walletChipText: { fontSize: 12.5, fontWeight: '900', color: colors.brand },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  cta: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  ctaText: { color: colors.onBrand, fontWeight: '800', fontSize: 13.5 },

  scrim: { flex: 1, backgroundColor: 'rgba(40,22,14,0.35)' },
  menu: {
    position: 'absolute',
    right: spacing.md,
    width: 250,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  muc: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 12 },
  mucText: { fontSize: 13.5, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: 4 },
});
