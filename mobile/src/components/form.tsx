import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
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

/**
 * Nhiều URL kênh mạng xã hội: mỗi kênh một ô, nút "+" thêm, "×" xóa.
 * Gộp lại thành một chuỗi ngăn cách bằng xuống dòng qua onChange.
 */
export function SocialLinksInput({
  label,
  value,
  onChange,
  placeholder,
  addLabel,
}: {
  label: string;
  value: string;
  onChange: (joined: string) => void;
  placeholder?: string;
  addLabel: string;
}) {
  const [rows, setRows] = useState<string[]>(() => {
    const arr = (value ?? '').split('\n');
    return arr.length ? arr : [''];
  });
  const sync = (next: string[]) => {
    setRows(next);
    onChange(next.map((s) => s.trim()).filter(Boolean).join('\n'));
  };
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      {rows.map((v, i) => (
        <View key={i} style={styles.socialRow}>
          <View style={[styles.wrap, { flex: 1 }]}>
            <TextInput
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              value={v}
              placeholder={placeholder}
              onChangeText={(nv) => {
                const n = [...rows];
                n[i] = nv;
                sync(n);
              }}
            />
          </View>
          {rows.length > 1 ? (
            <Pressable
              onPress={() => sync(rows.filter((_, j) => j !== i))}
              hitSlop={8}
              style={styles.socialDel}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ))}
      <Pressable onPress={() => sync([...rows, ''])} style={styles.socialAdd}>
        <Text style={styles.socialAddText}>+ {addLabel}</Text>
      </Pressable>
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

export function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.check}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onBrand} /> : null}
      </View>
      <Text style={styles.checkLabel}>{children}</Text>
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
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  socialDel: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialAdd: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandLine,
    backgroundColor: colors.brandSoft,
  },
  socialAddText: { fontSize: 13, fontWeight: '800', color: colors.brand },

  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },

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
