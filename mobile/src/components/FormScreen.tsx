import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Khung chung cho các màn hình biểu mẫu mở dạng tờ giấy (Đăng ký, Quên mật
 * khẩu, Ngân hàng, Rút tiền): thẻ trắng, nút quay lại, tránh bàn phím che ô
 * nhập.
 */
export function FormScreen({
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
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.sm }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
          <Text style={styles.backText}>Quay lại</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 12, padding: 4 },
  backText: { fontSize: 14, fontWeight: '700', color: colors.text },
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  title: { fontSize: 30, fontWeight: '900', color: colors.text, letterSpacing: -1.2 },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 20, lineHeight: 19 },
});
