import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { layMe } from '@/api/account';
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
  const [moXoa, setMoXoa] = useState(false);
  const [matKhau, setMatKhau] = useState('');
  const { data: phien } = useQuery({
    queryKey: ['sessions'],
    queryFn: layPhien,
    enabled: !!user,
  });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: layMe, enabled: !!user });
  // Có mật khẩu → xác nhận bằng mật khẩu; Google thuần → bằng email. Mặc định
  // true (an toàn hơn: đòi mật khẩu) khi chưa tải xong.
  const coMatKhau = me?.user.hasPassword ?? true;

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
    if (dangXL) return;
    setDangXL(true);
    try {
      await xoaTaiKhoan(
        forfeit,
        coMatKhau
          ? { password: matKhau || undefined }
          : { confirmEmail: matKhau || undefined },
      );
      setMoXoa(false);
      setMatKhau('');
      await dangXuat();
      router.dismissAll();
      Alert.alert(t('Đã xóa tài khoản', 'Account deleted'), t('Tài khoản của bạn đã được xóa.', 'Your account has been deleted.'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // Còn số dư/lệnh rút → backend chặn; hỏi lại để bỏ số dư (giữ mật khẩu đã nhập).
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
        // Sai mật khẩu / lỗi khác → giữ popup mở để nhập lại.
        Alert.alert(t('Chưa xóa được', "Couldn't delete"), msg || t('Thử lại sau.', 'Please try again later.'));
      }
    } finally {
      setDangXL(false);
    }
  }

  function hoiXoa() {
    setMatKhau('');
    setMoXoa(true);
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

      {/* Popup nhập mật khẩu để xóa tài khoản (giống web). */}
      <Modal visible={moXoa} transparent animationType="fade" onRequestClose={() => setMoXoa(false)}>
        <Pressable style={styles.scrim} onPress={() => setMoXoa(false)}>
          <Pressable style={styles.xoaCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.xoaIcon}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </View>
            <Text style={styles.xoaTitle}>{t('Xóa tài khoản?', 'Delete account?')}</Text>
            <Text style={styles.xoaSub}>
              {coMatKhau
                ? t(
                    'Hành động này không thể hoàn tác. Danh tính (email, tên, mật khẩu, ngân hàng) sẽ bị gỡ và bạn đăng xuất mọi thiết bị. Nhập mật khẩu để xác nhận.',
                    'This cannot be undone. Your identity (email, name, password, bank) will be removed and you will be signed out of all devices. Enter your password to confirm.',
                  )
                : t(
                    'Hành động này không thể hoàn tác. Tài khoản đăng nhập bằng Google không có mật khẩu — nhập đúng email tài khoản để xác nhận.',
                    'This cannot be undone. Google-only accounts have no password — enter your exact account email to confirm.',
                  )}
            </Text>
            <TextInput
              style={styles.xoaInput}
              value={matKhau}
              onChangeText={setMatKhau}
              placeholder={coMatKhau ? t('Mật khẩu', 'Password') : user.email}
              placeholderTextColor={colors.muted}
              secureTextEntry={coMatKhau}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={coMatKhau ? 'default' : 'email-address'}
              autoFocus
            />
            <Text style={styles.xoaHint}>
              {coMatKhau
                ? t('Nhập đúng mật khẩu tài khoản của bạn.', 'Enter your correct account password.')
                : t('Nhập đúng email tài khoản của bạn.', 'Enter your exact account email.')}
            </Text>
            <Pressable
              onPress={() => void xoa(false)}
              disabled={dangXL}
              style={({ pressed }) => [styles.xoaBtn, (pressed || dangXL) && { opacity: 0.85 }]}>
              {dangXL ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.xoaBtnText}>{t('Xóa tài khoản', 'Delete account')}</Text>
              )}
            </Pressable>
            <Pressable style={styles.xoaCancel} onPress={() => setMoXoa(false)}>
              <Text style={styles.xoaCancelText}>{t('Hủy', 'Cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(40,22,14,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  xoaCard: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: 8,
  },
  xoaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  xoaTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  xoaSub: { fontSize: 13, color: colors.muted, lineHeight: 19, marginBottom: 8 },
  xoaInput: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
  xoaHint: { fontSize: 11.5, color: colors.muted, marginBottom: 6 },
  xoaBtn: {
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xoaBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  xoaCancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
  xoaCancelText: { color: colors.muted, fontWeight: '800', fontSize: 14 },
});
