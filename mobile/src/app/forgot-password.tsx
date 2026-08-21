import { router } from 'expo-router';
import { useState } from 'react';

import { forgotPassword, resetPassword } from '@/api/auth';
import { ErrorBox, Field, InfoBox, PrimaryButton } from '@/components/form';
import { FormScreen } from '@/components/FormScreen';

/**
 * Quên mật khẩu — hai bước như web: gửi email nhận mã, rồi đặt lại mật khẩu.
 *
 * Bước 1 luôn báo "đã gửi" bất kể email có tồn tại hay không. Đó là chủ ý của
 * backend: báo "email không tồn tại" là để lộ tài khoản nào có thật, giúp kẻ
 * xấu dò danh sách người dùng.
 */
export default function ForgotPasswordScreen() {
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
      setTin(`Nếu ${email.trim()} có tài khoản, mã đặt lại đã được gửi tới đó.`);
      setBuoc(2);
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Không gửi được mã.');
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
      setLoi(e instanceof Error && e.message ? e.message : 'Mã chưa đúng hoặc đã hết hạn.');
    } finally {
      setDangGui(false);
    }
  }

  if (buoc === 2) {
    return (
      <FormScreen title="Đặt mật khẩu mới" subtitle="Nhập mã trong email và mật khẩu mới.">
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
        <Field
          label="Mật khẩu mới"
          icon="lock-closed-outline"
          value={matKhau}
          onChangeText={setMatKhau}
          placeholder="Ít nhất 10 ký tự"
          secureTextEntry
          hint="Ít nhất 10 ký tự, có chữ hoa, chữ thường và số."
        />
        <PrimaryButton
          label="Đổi mật khẩu"
          onPress={guiBuoc2}
          loading={dangGui}
          disabled={ma.trim().length !== 6 || matKhau.length < 10}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen
      title="Quên mật khẩu"
      subtitle="Nhập email đã đăng ký, chúng tôi gửi mã đặt lại tới đó.">
      <ErrorBox message={loi} />
      <Field
        label="Email"
        icon="mail-outline"
        value={email}
        onChangeText={setEmail}
        placeholder="ten@email.com"
        inputMode="email"
      />
      <PrimaryButton
        label="Gửi mã đặt lại"
        onPress={guiBuoc1}
        loading={dangGui}
        disabled={email.trim().length < 5}
      />
    </FormScreen>
  );
}
