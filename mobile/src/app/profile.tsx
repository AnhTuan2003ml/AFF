import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { dangXuatMoiThietBi, doiTen, layPhien, xoaTaiKhoan } from '@/api/bank';
import { useT } from '@/i18n';
import { ngayGio } from '@/lib/format';
import { CanDangNhap } from '@/components/CanDangNhap';
import { Field } from '@/components/form';
import { FormScreen } from '@/components/FormScreen';
import { useSession } from '@/hooks/useSession';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Thông tin cá nhân — dựng lại profile.njk của web: sửa họ tên, đăng xuất tất
 * cả thiết bị, và xóa tài khoản (xóa mềm — bắt buộc để lên App Store/CH Play).
 */
export default function ProfileScreen() {
  const t = useT();
  const { user, dangXuat, lamMoiHoSo } = useSession();
  const [ten, setTen] = useState(user?.fullName ?? '');
  const [dangLuu, setDangLuu] = useState(false);
  const [dangXL, setDangXL] = useState(false);
  const { data: phien } = useQuery({
    queryKey: ['sessions'],
    queryFn: layPhien,
    enabled: !!user,
  });

  if (!user) {
    return (
      <FormScreen title={t('Thông tin cá nhân', 'Personal information')}>
        <CanDangNhap mo_ta={t('Đăng nhập để xem và chỉnh sửa hồ sơ.', 'Log in to view and edit your profile.')} />
      </FormScreen>
    );
  }

  async function luuTen() {
    const tenTrim = ten.trim();
    if (tenTrim.length < 2 || dangLuu) return;
    setDangLuu(true);
    try {
      await doiTen(tenTrim);
      await lamMoiHoSo();
      Alert.alert(t('Đã lưu', 'Saved'), t('Cập nhật họ tên thành công.', 'Your name has been updated.'));
    } catch (e) {
      Alert.alert(t('Chưa lưu được', "Couldn't save"), e instanceof Error ? e.message : t('Thử lại sau.', 'Please try again later.'));
    } finally {
      setDangLuu(false);
    }
  }

  function hoiDangXuatAll() {
    Alert.alert(
      t('Đăng xuất tất cả thiết bị?', 'Log out of all devices?'),
      t(
        'Mọi phiên đăng nhập (kể cả web) sẽ bị thu hồi. Bạn cần đăng nhập lại.',
        'All sessions (including web) will be revoked. You will need to log in again.',
      ),
      [
        { text: t('Hủy', 'Cancel'), style: 'cancel' },
        {
          text: t('Đăng xuất tất cả', 'Log out all'),
          style: 'destructive',
          onPress: async () => {
            try {
              await dangXuatMoiThietBi();
            } finally {
              await dangXuat();
              router.dismissAll();
            }
          },
        },
      ],
    );
  }

  async function xoa(forfeit: boolean) {
    setDangXL(true);
    try {
      await xoaTaiKhoan(forfeit);
      await dangXuat();
      router.dismissAll();
      Alert.alert(t('Đã xóa tài khoản', 'Account deleted'), t('Tài khoản của bạn đã được xóa.', 'Your account has been deleted.'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // Còn số dư/lệnh rút → backend chặn; hỏi lại để bỏ số dư.
      if (!forfeit && /số dư|lệnh rút|balance|withdraw/i.test(msg)) {
        Alert.alert(
          t('Còn số dư/lệnh rút', 'Remaining balance/withdrawal'),
          `${msg}\n\n${t('Bạn vẫn muốn xóa và BỎ LẠI số dư?', 'Do you still want to delete and FORFEIT the balance?')}`,
          [
            { text: t('Hủy', 'Cancel'), style: 'cancel' },
            { text: t('Xóa & bỏ số dư', 'Delete & forfeit balance'), style: 'destructive', onPress: () => void xoa(true) },
          ],
        );
      } else {
        Alert.alert(t('Chưa xóa được', "Couldn't delete"), msg || t('Thử lại sau.', 'Please try again later.'));
      }
    } finally {
      setDangXL(false);
    }
  }

  function hoiXoa() {
    Alert.alert(
      t('Xóa tài khoản?', 'Delete account?'),
      t(
        'Hành động này không thể hoàn tác. Toàn bộ dữ liệu tài khoản sẽ bị xóa.',
        'This action cannot be undone. All account data will be deleted.',
      ),
      [
        { text: t('Hủy', 'Cancel'), style: 'cancel' },
        { text: t('Xóa tài khoản', 'Delete account'), style: 'destructive', onPress: () => void xoa(false) },
      ],
    );
  }

  return (
    <FormScreen title={t('Thông tin cá nhân', 'Personal information')} subtitle={t('Chỉnh sửa hồ sơ và bảo mật tài khoản.', 'Edit your profile and account security.')}>
      <Field
        label={t('Họ và tên', 'Full name')}
        icon="person-outline"
        value={ten}
        onChangeText={setTen}
        placeholder={t('Nguyễn Văn A', 'John Doe')}
        autoCapitalize="words"
      />
      <Field label="Email" icon="mail-outline" value={user.email} editable={false} />
      <Pressable
        onPress={luuTen}
        disabled={dangLuu}
        style={({ pressed }) => [styles.save, dangLuu && { opacity: 0.6 }, pressed && { backgroundColor: colors.brandStrong }]}>
        {dangLuu ? (
          <ActivityIndicator color={colors.onBrand} />
        ) : (
          <Text style={styles.saveText}>{t('Lưu thay đổi', 'Save changes')}</Text>
        )}
      </Pressable>

      <Text style={styles.section}>{t('Phiên đăng nhập', 'Login sessions')}</Text>
      {(phien ?? []).map((p) => (
        <View key={p.id} style={styles.phienRow}>
          <Ionicons
            name={p.client === 'mobile' ? 'phone-portrait-outline' : 'desktop-outline'}
            size={18}
            color={colors.brand}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.phienTitle}>
              {p.client === 'mobile' ? t('Ứng dụng di động', 'Mobile app') : t('Trình duyệt web', 'Web browser')}
              {p.is_current ? t(' · phiên hiện tại', ' · current session') : ''}
            </Text>
            <Text style={styles.phienTime}>{t('Hoạt động', 'Last active')}: {ngayGio(p.last_seen_at)}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.section}>{t('Bảo mật', 'Security')}</Text>
      <Pressable onPress={hoiDangXuatAll} style={styles.row}>
        <Ionicons name="log-out-outline" size={19} color={colors.text} />
        <Text style={styles.rowText}>{t('Đăng xuất tất cả thiết bị', 'Log out of all devices')}</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.muted} />
      </Pressable>

      <Text style={styles.section}>{t('Vùng nguy hiểm', 'Danger zone')}</Text>
      <Pressable onPress={hoiXoa} disabled={dangXL} style={[styles.row, dangXL && { opacity: 0.6 }]}>
        {dangXL ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Ionicons name="trash-outline" size={19} color={colors.danger} />
        )}
        <Text style={[styles.rowText, { color: colors.danger }]}>{t('Xóa tài khoản', 'Delete account')}</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.danger} />
      </Pressable>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  save: {
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },

  section: { fontSize: 13, fontWeight: '900', color: colors.text, marginTop: spacing.lg, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },

  phienRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  phienTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  phienTime: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
});
