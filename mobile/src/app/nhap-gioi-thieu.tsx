import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { guiMaNguoiGioiThieu } from '@/api/features';
import { FormScreen } from '@/components/FormScreen';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Mời nhập mã giới thiệu cho tài khoản mới đăng ký qua Google (luồng form đã
 * có ô mã ngay lúc đăng ký; luồng Google thì server báo isNew=1 và app mở màn
 * này). Bỏ qua được — sau vẫn nhập bù ở tab Giới thiệu.
 */
export default function NhapGioiThieuScreen() {
  const qc = useQueryClient();
  const [ma, setMa] = useState('');

  const gui = useMutation({
    mutationFn: guiMaNguoiGioiThieu,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      Alert.alert('Đã ghi nhận', 'Người giới thiệu của bạn đã được ghi nhận.');
      thoat();
    },
    onError: (e) =>
      Alert.alert('Chưa được', e instanceof Error ? e.message : 'Kiểm tra lại mã nhé.'),
  });

  function thoat() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  return (
    <FormScreen
      title="Bạn có mã giới thiệu?"
      subtitle="Nếu có bạn bè/đối tác giới thiệu, nhập mã của họ để cả hai cùng nhận quyền lợi. Không có thì bỏ qua nhé.">
      <TextInput
        value={ma}
        onChangeText={setMa}
        placeholder="VD: 557922 hoặc NamDong"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        maxLength={20}
        style={styles.input}
      />
      <Pressable
        onPress={() => ma.trim() && gui.mutate(ma.trim())}
        disabled={gui.isPending || !ma.trim()}
        style={({ pressed }) => [
          styles.submit,
          (pressed || gui.isPending || !ma.trim()) && { opacity: 0.7 },
        ]}>
        <Text style={styles.submitText}>{gui.isPending ? 'Đang gửi…' : 'Xác nhận'}</Text>
      </Pressable>
      <Pressable onPress={thoat} style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}>
        <Text style={styles.skipText}>Bỏ qua</Text>
      </Pressable>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  submit: {
    minHeight: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: colors.onBrand, fontWeight: '900', fontSize: 15 },
  skip: { alignItems: 'center', paddingVertical: 14 },
  skipText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
});
