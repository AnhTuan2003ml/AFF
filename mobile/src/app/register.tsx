import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { register, verifyEmail } from '@/api/auth';
import { Checkbox, ErrorBox, Field, InfoBox, PrimaryButton } from '@/components/form';
import { FormScreen } from '@/components/FormScreen';
import { GoogleButton, googleConfigured } from '@/components/GoogleButton';
import { useSession } from '@/hooks/useSession';
import { colors } from '@/theme/tokens';

/**
 * Đăng ký — hai bước, giống hệt web.
 *
 * Bước 1 gửi hồ sơ, backend gửi mã OTP 6 số về email. Bước 2 nhập mã là có
 * token luôn, không bắt đăng nhập lại. Giữ nguyên email đã nhập giữa hai bước
 * để người dùng không phải gõ lại.
 */
export default function RegisterScreen() {
  const { lamMoiHoSo } = useSession();
  const [buoc, setBuoc] = useState<1 | 2>(1);

  const [hoTen, setHoTen] = useState('');
  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [nhapLai, setNhapLai] = useState('');
  const [gioiThieu, setGioiThieu] = useState('');
  const [dongY, setDongY] = useState(false);
  const [ma, setMa] = useState('');

  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tin, setTin] = useState<string | null>(null);

  async function guiBuoc1() {
    setLoi(null);
    if (matKhau !== nhapLai) {
      setLoi('Hai lần nhập mật khẩu chưa khớp nhau.');
      return;
    }
    if (!dongY) {
      setLoi('Bạn cần đồng ý với các chính sách để tạo tài khoản.');
      return;
    }
    setDangGui(true);
    try {
      await register({
        fullName: hoTen.trim(),
        email: email.trim(),
        password: matKhau,
        passwordConfirm: nhapLai,
        referralCode: gioiThieu.trim() || undefined,
        acceptPolicies: dongY,
      });
      setTin(`Đã gửi mã 6 số tới ${email.trim()}. Mã có hiệu lực 10 phút.`);
      setBuoc(2);
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Không tạo được tài khoản.');
    } finally {
      setDangGui(false);
    }
  }

  async function guiBuoc2() {
    setLoi(null);
    setDangGui(true);
    try {
      await verifyEmail(email.trim(), ma.trim());
      await lamMoiHoSo();
      // Đóng cả màn đăng ký lẫn màn đăng nhập phía dưới nếu có.
      router.dismissAll();
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Mã xác nhận chưa đúng.');
    } finally {
      setDangGui(false);
    }
  }

  if (buoc === 2) {
    return (
      <FormScreen
        title="Nhập mã OTP"
        subtitle="Bước 2/2 — mở email và nhập mã 6 số vừa nhận.">
        <ErrorBox message={loi} />
        <InfoBox message={tin} />
        <Field
          label="Mã xác nhận"
          icon="key-outline"
          value={ma}
          onChangeText={setMa}
          placeholder="6 số"
          inputMode="numeric"
          maxLength={6}
        />
        <PrimaryButton
          label="Xác nhận và vào app"
          onPress={guiBuoc2}
          loading={dangGui}
          disabled={ma.trim().length !== 6}
        />
        <Pressable onPress={() => setBuoc(1)} style={styles.link} hitSlop={8}>
          <Text style={styles.linkText}>Nhập sai email? Quay lại bước 1</Text>
        </Pressable>
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title="Tạo tài khoản"
      subtitle="Bước 1/2 — nhập email đang hoạt động để nhận mã OTP">
      <ErrorBox message={loi} />
      <Field
        label="Họ và tên"
        icon="person-outline"
        value={hoTen}
        onChangeText={setHoTen}
        placeholder="Nguyễn Văn A"
        autoCapitalize="words"
      />
      <Field
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="ten@email.com"
        inputMode="email"
      />
      <Field
        label="Mật khẩu"
        icon="lock-closed-outline"
        value={matKhau}
        onChangeText={setMatKhau}
        placeholder="Ít nhất 10 ký tự"
        secureTextEntry
        hint="Ít nhất 10 ký tự, có chữ hoa, chữ thường và số."
      />
      <Field
        label="Nhập lại mật khẩu"
        icon="lock-closed-outline"
        value={nhapLai}
        onChangeText={setNhapLai}
        placeholder="Nhập lại mật khẩu"
        secureTextEntry
      />
      <Field
        label="Mã giới thiệu (không bắt buộc)"
        icon="pricetag-outline"
        value={gioiThieu}
        onChangeText={setGioiThieu}
        placeholder="Nếu có"
      />
      <View style={styles.policyRow}>
        <Checkbox checked={dongY} onToggle={() => setDongY((v) => !v)}>
          Tôi đồng ý với Điều khoản, Chính sách quyền riêng tư và Chính sách
          người dùng của ShopTik.
        </Checkbox>
      </View>
      <PrimaryButton
        label="Gửi mã OTP  →"
        onPress={guiBuoc1}
        loading={dangGui}
        disabled={
          !dongY ||
          hoTen.trim().length < 2 ||
          email.trim().length < 5 ||
          matKhau.length < 10
        }
      />
      {googleConfigured && (
        <>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>hoặc</Text>
            <View style={styles.dividerLine} />
          </View>
          <GoogleButton onError={setLoi} />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center', marginTop: 16, padding: 6 },
  linkText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  policyRow: { marginTop: 2, marginBottom: 18 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dividerText: { fontSize: 12, color: colors.muted, fontWeight: '700' },
});
