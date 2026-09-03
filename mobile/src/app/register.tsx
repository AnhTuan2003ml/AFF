import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { register, verifyEmail } from '@/api/auth';
import { AuthCard } from '@/components/AuthCard';
import { Checkbox, ErrorBox, Field, InfoBox, PrimaryButton } from '@/components/form';
import { GoogleButton } from '@/components/GoogleButton';
import { useSession } from '@/hooks/useSession';
import { useLang, useT } from '@/i18n';
import { DUONG_DAN_PHAP_LY, moTrangPhapLy } from '@/lib/legal';
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
  const t = useT();
  const { lang } = useLang();
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
      setLoi(t('Hai lần nhập mật khẩu chưa khớp nhau.', 'The two passwords do not match.'));
      return;
    }
    if (!dongY) {
      setLoi(
        t(
          'Bạn cần đồng ý với các chính sách để tạo tài khoản.',
          'You must accept the policies to create an account.',
        ),
      );
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
      setTin(
        `${t('Đã gửi mã 6 số tới', 'Sent a 6-digit code to')} ${email.trim()}. ${t('Mã có hiệu lực 10 phút.', 'The code is valid for 10 minutes.')}`,
      );
      setBuoc(2);
    } catch (e) {
      setLoi(
        e instanceof Error && e.message
          ? e.message
          : t('Không tạo được tài khoản.', 'Could not create the account.'),
      );
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
      setLoi(
        e instanceof Error && e.message
          ? e.message
          : t('Mã xác nhận chưa đúng.', 'The verification code is incorrect.'),
      );
    } finally {
      setDangGui(false);
    }
  }

  if (buoc === 2) {
    return (
      <AuthCard
        title={t('Nhập mã OTP', 'Enter OTP code')}
        subtitle={t('Bước 2/2 — mở email và nhập mã 6 số vừa nhận.', 'Step 2/2 — open your email and enter the 6-digit code.')}>
        <ErrorBox message={loi} />
        <InfoBox message={tin} />
        <Field
          label={t('Mã xác nhận', 'Verification code')}
          icon="key-outline"
          value={ma}
          onChangeText={setMa}
          placeholder={t('6 số', '6 digits')}
          inputMode="numeric"
          maxLength={6}
        />
        <PrimaryButton
          label={t('Xác nhận và vào app', 'Confirm and enter app')}
          onPress={guiBuoc2}
          loading={dangGui}
          disabled={ma.trim().length !== 6}
        />
        <Pressable onPress={() => setBuoc(1)} style={styles.link} hitSlop={8}>
          <Text style={styles.linkText}>{t('Nhập sai email? Quay lại bước 1', 'Wrong email? Back to step 1')}</Text>
        </Pressable>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('Tạo tài khoản', 'Create account')}
      subtitle={t('Bước 1/2 — nhập email đang hoạt động để nhận mã OTP', 'Step 1/2 — enter an active email to receive the OTP code')}>
      <ErrorBox message={loi} />
      <Field
        label={t('Họ và tên', 'Full name')}
        icon="person-outline"
        value={hoTen}
        onChangeText={setHoTen}
        placeholder={t('Nguyễn Văn A', 'John Doe')}
        autoCapitalize="words"
      />
      <Field
        label={t('Email', 'Email')}
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder={t('ten@email.com', 'you@email.com')}
        inputMode="email"
      />
      <Field
        label={t('Mật khẩu', 'Password')}
        icon="lock-closed-outline"
        value={matKhau}
        onChangeText={setMatKhau}
        placeholder={t('Ít nhất 10 ký tự', 'At least 10 characters')}
        secureTextEntry
        hint={t('Ít nhất 10 ký tự, có chữ hoa, chữ thường và số.', 'At least 10 characters with uppercase, lowercase and a number.')}
      />
      <Field
        label={t('Nhập lại mật khẩu', 'Confirm password')}
        icon="lock-closed-outline"
        value={nhapLai}
        onChangeText={setNhapLai}
        placeholder={t('Nhập lại mật khẩu', 'Re-enter your password')}
        secureTextEntry
      />
      <Field
        label={t('Mã giới thiệu (không bắt buộc)', 'Referral code (optional)')}
        icon="pricetag-outline"
        value={gioiThieu}
        onChangeText={setGioiThieu}
        placeholder={t('Nếu có', 'If any')}
      />
      <View style={styles.policyRow}>
        <Checkbox checked={dongY} onToggle={() => setDongY((v) => !v)}>
          {t('Tôi đồng ý với', 'I agree to the')}{' '}
          <Text style={styles.policyLink} onPress={() => moTrangPhapLy(DUONG_DAN_PHAP_LY.dieuKhoan, lang)}>
            {t('Điều khoản', 'Terms')}
          </Text>
          ,{' '}
          <Text style={styles.policyLink} onPress={() => moTrangPhapLy(DUONG_DAN_PHAP_LY.quyenRiengTu, lang)}>
            {t('Chính sách quyền riêng tư', 'Privacy Policy')}
          </Text>{' '}
          {t('và', 'and')}{' '}
          <Text style={styles.policyLink} onPress={() => moTrangPhapLy(DUONG_DAN_PHAP_LY.chinhSachNguoiDung, lang)}>
            {t('Chính sách người dùng', 'User Policy')}
          </Text>
          .
        </Checkbox>
      </View>
      <PrimaryButton
        label={t('Gửi mã OTP  →', 'Send OTP code  →')}
        onPress={guiBuoc1}
        loading={dangGui}
        disabled={
          !dongY ||
          hoTen.trim().length < 2 ||
          email.trim().length < 5 ||
          matKhau.length < 10
        }
      />
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('hoặc', 'or')}</Text>
        <View style={styles.dividerLine} />
      </View>
      <GoogleButton onError={setLoi} />
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center', marginTop: 16, padding: 6 },
  linkText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  policyRow: { marginTop: 2, marginBottom: 18 },
  policyLink: { color: colors.brand, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dividerText: { fontSize: 12, color: colors.muted, fontWeight: '700' },
});
