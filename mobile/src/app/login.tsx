import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Checkbox } from '@/components/form';
import { GoogleButton, googleConfigured } from '@/components/GoogleButton';
import { useSession } from '@/hooks/useSession';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Đăng nhập — dựng lại thẻ `.auth-card` của web ở khổ điện thoại: hàng thương
 * hiệu (logo + chữ ShopTik) căn giữa phía trên, rồi tiêu đề và biểu mẫu căn
 * trái. Giống hệt bố cục đã chốt bên web.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { dangNhap } = useSession();

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
      // Thông báo từ backend đã là tiếng Việt (AppError), hiện thẳng cho người
      // dùng. Chỉ khi không có message mới dùng câu dự phòng.
      setLoi(e instanceof Error && e.message ? e.message : 'Không đăng nhập được. Thử lại.');
    } finally {
      setDangGui(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.brandRow}>
            <Image
              source={require('../../assets/images/brand-logo.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.brandText}>ShopTik</Text>
          </View>

          <Text style={styles.title}>Đăng nhập</Text>
          <Text style={styles.subtitle}>Vào ví để xem tiền hoàn và tạo lệnh rút</Text>

          {loi ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{loi}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={17} color={colors.muted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="ten@email.com"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              textContentType="emailAddress"
            />
          </View>

          <Text style={styles.label}>Mật khẩu</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={17} color={colors.muted} />
            <TextInput
              value={matKhau}
              onChangeText={setMatKhau}
              placeholder="Nhập mật khẩu"
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

          <View style={styles.rememberRow}>
            <Checkbox checked={ghiNho} onToggle={() => setGhiNho((v) => !v)}>
              Ghi nhớ đăng nhập
            </Checkbox>
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
              <Text style={styles.primaryBtnText}>Đăng nhập  →</Text>
            )}
          </Pressable>

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

          <View style={styles.links}>
            <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8}>
              <Text style={styles.linkStrong}>Quên mật khẩu?</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/register')} hitSlop={8}>
              <Text style={styles.linkStrong}>Tạo tài khoản</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.back()} style={styles.cancel} hitSlop={8}>
            <Text style={styles.cancelText}>Để sau</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 11,
    marginBottom: 18,
  },
  logo: { width: 46, height: 46 },
  brandText: { fontSize: 27, fontWeight: '900', letterSpacing: -1.1, color: colors.brand },
  title: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -1.2 },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 20 },

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

  rememberRow: { marginBottom: 18, marginTop: 2 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  dividerText: { fontSize: 12, color: colors.muted, fontWeight: '700' },

  primaryBtn: {
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  linkStrong: { color: colors.brand, fontSize: 13.5, fontWeight: '800' },
  cancel: { alignSelf: 'center', marginTop: 16, padding: 6 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
