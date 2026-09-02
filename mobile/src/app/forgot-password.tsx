import { router } from 'expo-router';
import { useState } from 'react';

import { forgotPassword, resetPassword } from '@/api/auth';
import { ErrorBox, Field, InfoBox, PrimaryButton } from '@/components/form';
import { FormScreen } from '@/components/FormScreen';
import { useT } from '@/i18n';

/**
 * Quên mật khẩu — hai bước như web: gửi email nhận mã, rồi đặt lại mật khẩu.
 *
 * Bước 1 luôn báo "đã gửi" bất kể email có tồn tại hay không. Đó là chủ ý của
 * backend: báo "email không tồn tại" là để lộ tài khoản nào có thật, giúp kẻ
 * xấu dò danh sách người dùng.
 */
export default function ForgotPasswordScreen() {
  const t = useT();
  const [buoc, setBuoc] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [ma, setMa] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tin, setTin] = useState<string | null>(null);

  async function guiBuoc1() {
    setLoi(null);
    setDangGui(true);
    try {
      await forgotPassword(email.trim());
      setTin(
        `${t('Nếu', 'If')} ${email.trim()} ${t('có tài khoản, mã đặt lại đã được gửi tới đó.', 'has an account, a reset code has been sent to it.')}`,
      );
      setBuoc(2);
    } catch (e) {
      setLoi(
        e instanceof Error && e.message
          ? e.message
          : t('Không gửi được mã.', 'Could not send the code.'),
      );
    } finally {
      setDangGui(false);
    }
  }

  async function guiBuoc2() {
    setLoi(null);
    setDangGui(true);
    try {
      await resetPassword({ email: email.trim(), code: ma.trim(), password: matKhau });
      router.replace('/login');
    } catch (e) {
      setLoi(
        e instanceof Error && e.message
          ? e.message
          : t('Mã chưa đúng hoặc đã hết hạn.', 'The code is incorrect or has expired.'),
      );
    } finally {
      setDangGui(false);
    }
  }

  if (buoc === 2) {
    return (
      <FormScreen
        title={t('Đặt mật khẩu mới', 'Set a new password')}
        subtitle={t('Nhập mã trong email và mật khẩu mới.', 'Enter the code from your email and a new password.')}>
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
        <Field
          label={t('Mật khẩu mới', 'New password')}
          icon="lock-closed-outline"
          value={matKhau}
          onChangeText={setMatKhau}
          placeholder={t('Ít nhất 10 ký tự', 'At least 10 characters')}
          secureTextEntry
          hint={t('Ít nhất 10 ký tự, có chữ hoa, chữ thường và số.', 'At least 10 characters with uppercase, lowercase and a number.')}
        />
        <PrimaryButton
          label={t('Đổi mật khẩu', 'Change password')}
          onPress={guiBuoc2}
          loading={dangGui}
          disabled={ma.trim().length !== 6 || matKhau.length < 10}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title={t('Quên mật khẩu', 'Forgot password')}
      subtitle={t('Nhập email đã đăng ký, chúng tôi gửi mã đặt lại tới đó.', 'Enter your registered email and we will send a reset code to it.')}>
      <ErrorBox message={loi} />
      <Field
        label={t('Email', 'Email')}
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder={t('ten@email.com', 'you@email.com')}
        inputMode="email"
      />
      <PrimaryButton
        label={t('Gửi mã đặt lại', 'Send reset code')}
        onPress={guiBuoc1}
        loading={dangGui}
        disabled={email.trim().length < 5}
      />
    </FormScreen>
  );
}
