import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useSession } from '@/hooks/useSession';
import { colors, radius } from '@/theme/tokens';

/*
 * Đăng nhập bằng Google trên app.
 *
 * Web dùng luồng redirect + cookie; app KHÔNG dùng lại được vì xác thực bằng
 * Bearer token. Ở đây lấy id_token qua expo-auth-session rồi gửi lên
 * /api/v1/auth/token/google để đổi lấy cặp token của hệ thống.
 *
 * Client ID lấy từ biến EXPO_PUBLIC_* (Expo tự nạp từ .env). Chưa cấu hình cái
 * nào thì nút tự ẩn — đúng cách web ẩn nút khi Google chưa bật.
 */

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export const googleConfigured = Boolean(
  WEB_CLIENT_ID || ANDROID_CLIENT_ID || IOS_CLIENT_ID,
);

export function GoogleButton(props: { onError?: (message: string) => void }) {
  // Chưa cấu hình thì không mount phần dùng hook — tránh gọi hook vô nghĩa.
  if (!googleConfigured) return null;
  return <GoogleButtonInner {...props} />;
}

function GoogleButtonInner({ onError }: { onError?: (message: string) => void }) {
  const { dangNhapGoogle } = useSession();
  const [dangChay, setDangChay] = useState(false);
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        setDangChay(false);
        onError?.('Google không trả về mã đăng nhập. Hãy thử lại.');
        return;
      }
      dangNhapGoogle(idToken)
        .catch((e: unknown) =>
          onError?.(
            e instanceof Error && e.message
              ? e.message
              : 'Không đăng nhập được bằng Google.',
          ),
        )
        .finally(() => setDangChay(false));
    } else {
      // error / cancel / dismiss / locked — dừng trạng thái chạy.
      setDangChay(false);
    }
    // Chỉ chạy lại khi có phản hồi mới.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <Pressable
      onPress={() => {
        setDangChay(true);
        void promptAsync();
      }}
      disabled={!request || dangChay}
      style={({ pressed }) => [
        styles.btn,
        (!request || dangChay) && { opacity: 0.6 },
        pressed && request && !dangChay && { backgroundColor: colors.surfaceMuted },
      ]}>
      {dangChay ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          <Ionicons name="logo-google" size={18} color="#ea4335" />
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
