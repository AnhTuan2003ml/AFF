import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

/**
 * Mảnh biểu mẫu dùng chung cho Đăng nhập, Đăng ký, Ngân hàng và Rút tiền.
 *
 * Gom về một chỗ vì bốn màn hình đó có cùng bố cục ô nhập; để mỗi màn tự dựng
 * thì viền, chiều cao và khoảng cách sẽ trôi khỏi nhau sau vài lần sửa.
 */

export function Field({
  label,
  icon,
  hint,
  ...input
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  hint?: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>
        {icon ? <Ionicons name={icon} size={17} color={colors.muted} /> : null}
        <TextInput
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          {...input}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const tat = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={tat}
      style={({ pressed }) => [
        styles.btn,
        tat && { opacity: 0.5 },
        pressed && !tat && { backgroundColor: colors.brandStrong },
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.onBrand} />
      ) : (
        <Text style={styles.btnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.err}>
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <Text style={styles.errText}>{message}</Text>
    </View>
  );
}

export function InfoBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.info}>
      <Ionicons name="mail-outline" size={16} color={colors.success} />
      <Text style={styles.infoText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: '800', color: colors.text, marginBottom: 8 },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 50,
  },
  input: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  hint: { fontSize: 11.5, color: colors.muted, marginTop: 6 },

  btn: {
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnText: { color: colors.onBrand, fontWeight: '800', fontSize: 15 },

  err: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
    marginBottom: 16,
  },
  errText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600' },

  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.successSoft,
    marginBottom: 16,
  },
  infoText: { flex: 1, color: colors.success, fontSize: 13, fontWeight: '600' },
});
