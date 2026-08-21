import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { dangXuatMoiThietBi, doiTen, layPhien, xoaTaiKhoan } from '@/api/bank';
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
      <FormScreen title="Thông tin cá nhân">
        <CanDangNhap mo_ta="Đăng nhập để xem và chỉnh sửa hồ sơ." />
      </FormScreen>
    );
  }

  async function luuTen() {
    const t = ten.trim();
    if (t.length < 2 || dangLuu) return;
    setDangLuu(true);
    try {
      await doiTen(t);
      await lamMoiHoSo();
      Alert.alert('Đã lưu', 'Cập nhật họ tên thành công.');
    } catch (e) {
      Alert.alert('Chưa lưu được', e instanceof Error ? e.message : 'Thử lại sau.');
    } finally {
      setDangLuu(false);
    }
  }

  function hoiDangXuatAll() {
    Alert.alert(
      'Đăng xuất tất cả thiết bị?',
      'Mọi phiên đăng nhập (kể cả web) sẽ bị thu hồi. Bạn cần đăng nhập lại.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất tất cả',
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
      Alert.alert('Đã xóa tài khoản', 'Tài khoản của bạn đã được xóa.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // Còn số dư/lệnh rút → backend chặn; hỏi lại để bỏ số dư.
      if (!forfeit && /số dư|lệnh rút|balance|withdraw/i.test(msg)) {
        Alert.alert(
          'Còn số dư/lệnh rút',
          `${msg}\n\nBạn vẫn muốn xóa và BỎ LẠI số dư?`,
          [
            { text: 'Hủy', style: 'cancel' },
            { text: 'Xóa & bỏ số dư', style: 'destructive', onPress: () => void xoa(true) },
          ],
        );
      } else {
        Alert.alert('Chưa xóa được', msg || 'Thử lại sau.');
      }
    } finally {
      setDangXL(false);
    }
  }

  function hoiXoa() {
    Alert.alert(
      'Xóa tài khoản?',
      'Hành động này không thể hoàn tác. Toàn bộ dữ liệu tài khoản sẽ bị xóa.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa tài khoản', style: 'destructive', onPress: () => void xoa(false) },
      ],
    );
  }

  return (
    <FormScreen title="Thông tin cá nhân" subtitle="Chỉnh sửa hồ sơ và bảo mật tài khoản.">
      <Field
        label="Họ và tên"
        icon="person-outline"
        value={ten}
        onChangeText={setTen}
        placeholder="Nguyễn Văn A"
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
          <Text style={styles.saveText}>Lưu thay đổi</Text>
        )}
      </Pressable>

      <Text style={styles.section}>Phiên đăng nhập</Text>
      {(phien ?? []).map((p) => (
        <View key={p.id} style={styles.phienRow}>
          <Ionicons
            name={p.client === 'mobile' ? 'phone-portrait-outline' : 'desktop-outline'}
            size={18}
            color={colors.brand}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.phienTitle}>
              {p.client === 'mobile' ? 'Ứng dụng di động' : 'Trình duyệt web'}
              {p.is_current ? ' · phiên hiện tại' : ''}
            </Text>
            <Text style={styles.phienTime}>Hoạt động: {ngayGio(p.last_seen_at)}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.section}>Bảo mật</Text>
      <Pressable onPress={hoiDangXuatAll} style={styles.row}>
        <Ionicons name="log-out-outline" size={19} color={colors.text} />
        <Text style={styles.rowText}>Đăng xuất tất cả thiết bị</Text>
        <Ionicons name="chevron-forward" size={17} color={colors.muted} />
      </Pressable>

      <Text style={styles.section}>Vùng nguy hiểm</Text>
      <Pressable onPress={hoiXoa} disabled={dangXL} style={[styles.row, dangXL && { opacity: 0.6 }]}>
        {dangXL ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Ionicons name="trash-outline" size={19} color={colors.danger} />
        )}
        <Text style={[styles.rowText, { color: colors.danger }]}>Xóa tài khoản</Text>
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
