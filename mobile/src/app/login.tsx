import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuthCard } from '@/components/AuthCard';
import { Checkbox } from '@/components/form';
import { GoogleButton } from '@/components/GoogleButton';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';
import { colors, radius } from '@/theme/tokens';

/**
 * Đăng nhập — dựng lại `.auth-card` của web ở khổ điện thoại qua AuthCard.
 * Trình tự khối bám đúng web mobile: [Email] → [Mật khẩu] →
 * [Ghi nhớ | Quên mật khẩu] → nút → "hoặc" + Google → link tạo tài khoản.
 */
export default function LoginScreen() {
  const { dangNhap } = useSession();
  const t = useT();

  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [hienMatKhau, setHienMatKhau] = useState(false);
  const [ghiNho, setGhiNho] = useState(true);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const guiDuoc = email.trim().length > 3 && matKhau.length > 0 && !dangGui;

  async function gui() {
    if (!guiDuoc) return;
    setLoi(null);
    setDangGui(true);
    try {
      await dangNhap(email.trim(), matKhau, ghiNho);
      router.back();
    } catch (e) {
      setLoi(
        e instanceof Error && e.message
          ? e.message
          : t('Không đăng nhập được. Thử lại.', 'Could not sign in. Please try again.'),
      );
    } finally {
      setDangGui(false);
    }
  }

  return (
    <AuthCard
      title={t('Đăng nhập', 'Sign in')}
      subtitle={t('Vào ví để xem tiền hoàn và tạo lệnh rút', 'Open your wallet to view cashback and request withdrawals')}>
      {loi ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{loi}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>{t('Email', 'Email')}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="mail-outline" size={17} color={colors.muted} />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('ten@email.com', 'you@email.com')}
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="email"
          textContentType="emailAddress"
        />
      </View>

      <Text style={styles.label}>{t('Mật khẩu', 'Password')}</Text>
      <View style={styles.inputWrap}>
        <Ionicons name="lock-closed-outline" size={17} color={colors.muted} />
        <TextInput
          value={matKhau}
          onChangeText={setMatKhau}
          placeholder={t('Nhập mật khẩu', 'Enter your password')}
          placeholderTextColor={colors.muted}
          style={styles.input}
          secureTextEntry={!hienMatKhau}
          autoCapitalize="none"
          textContentType="password"
          onSubmitEditing={gui}
          returnKeyType="go"
        />
        <Pressable onPress={() => setHienMatKhau((v) => !v)} hitSlop={10}>
          <Ionicons
            name={hienMatKhau ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={colors.muted}
          />
        </Pressable>
      </View>

      <View style={styles.inlineActions}>
        <View style={styles.rememberWrap}>
          <Checkbox checked={ghiNho} onToggle={() => setGhiNho((v) => !v)}>
            {t('Ghi nhớ đăng nhập', 'Remember me')}
          </Checkbox>
        </View>
        <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8}>
          <Text style={styles.linkStrong}>{t('Quên mật khẩu?', 'Forgot password?')}</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={gui}
        disabled={!guiDuoc}
        style={({ pressed }) => [
          styles.primaryBtn,
          !guiDuoc && { opacity: 0.5 },
          pressed && guiDuoc && { backgroundColor: colors.brandStrong },
        ]}>
        {dangGui ? (
          <ActivityIndicator color={colors.onBrand} />
        ) : (
          <Text style={styles.primaryBtnText}>{t('Đăng nhập  →', 'Sign in  →')}</Text>
        )}
      </Pressable>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t('hoặc', 'or')}</Text>
        <View style={styles.dividerLine} />
      </View>
      <GoogleButton onError={setLoi} />

      <Text style={styles.switch}>
        {t('Chưa có tài khoản?', "Don't have an account?")}{' '}
        <Text style={styles.switchLink} onPress={() => router.push('/register')}>
          {t('Tạo tài khoản', 'Create account')}
        </Text>
      </Text>
    </AuthCard>
  );
}

const styles = StyleSheet.create({
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    marginBottom: 16,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },

  label: { fontSize: 12.5, fontWeight: '800', color: colors.text, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 16,
  },
  input: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },

  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
    marginBottom: 18,
  },
  rememberWrap: { flex: 1 },
  linkStrong: { color: colors.brand, fontSize: 13.5, fontWeight: '800' },

  primaryBtn: {
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dividerText: { fontSize: 12, color: colors.muted, fontWeight: '700' },

  switch: {
    textAlign: 'center',
    marginTop: 18,
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  switchLink: { color: colors.brand, fontWeight: '800' },
});
