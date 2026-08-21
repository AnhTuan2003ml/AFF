import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Thẻ xác thực — dựng lại `.auth-card` của web ở khổ điện thoại, dùng chung cho
 * Đăng nhập và Đăng ký để hai màn giống hệt nhau: hàng thương hiệu (logo +
 * ShopTik) căn giữa trên cùng, tiêu đề và phụ đề căn trái, nội dung form, và
 * dòng "Kết nối bảo mật" ngăn bằng vạch mảnh ở chân thẻ.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();

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

          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {children}

          <View style={styles.secure}>
            <Ionicons name="lock-closed" size={13} color={colors.muted} />
            <Text style={styles.secureText}>
              Kết nối bảo mật · ShopTik không lưu mật khẩu tài khoản sàn của bạn
            </Text>
          </View>
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
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 20, lineHeight: 19 },

  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  secureText: { flex: 1, fontSize: 11, color: colors.muted, lineHeight: 16 },
});
