import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { GoogleG } from '@/components/GoogleG';
import { useSession } from '@/hooks/useSession';
import { colors, radius } from '@/theme/tokens';

/*
 * Nút "Tiếp tục với Google" — dùng lại đúng luồng Google của máy chủ web.
 *
 * Bấm nút sẽ mở /auth/google?flow=mobile trong trình duyệt hệ thống; máy chủ
 * chạy trọn OAuth rồi trả Bearer token về deep-link của app (xem
 * api/auth.loginWithGoogleWeb). Không cần Android/iOS Client ID và chạy được cả
 * trong Expo Go, nên nút luôn hoạt động.
 */
export function GoogleButton({ onError }: { onError?: (message: string) => void }) {
  const { dangNhapGoogle } = useSession();
  const [dangChay, setDangChay] = useState(false);

  async function chay() {
    if (dangChay) return;
    setDangChay(true);
    try {
      await dangNhapGoogle();
    } catch (e) {
      // Người dùng tự đóng trình duyệt thì im lặng, còn lại mới báo lỗi.
      const msg =
        e instanceof Error && e.message ? e.message : 'Không đăng nhập được bằng Google.';
      if (!/hủy/i.test(msg)) onError?.(msg);
    } finally {
      setDangChay(false);
    }
  }

  return (
    <Pressable
      onPress={chay}
      disabled={dangChay}
      style={({ pressed }) => [
        styles.btn,
        dangChay && { opacity: 0.6 },
        pressed && !dangChay && { backgroundColor: colors.surfaceMuted },
      ]}>
      {dangChay ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <GoogleG size={18} />
          <Text style={styles.text}>Tiếp tục với Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  text: { color: colors.text, fontWeight: '800', fontSize: 14.5 },
});
