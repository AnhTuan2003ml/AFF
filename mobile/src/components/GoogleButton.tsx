import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { GoogleG } from '@/components/GoogleG';
import { useSession } from '@/hooks/useSession';
import { colors, radius } from '@/theme/tokens';

/*
 * Nút "Tiếp tục với Google" trên app.
 *
 * Web dùng luồng redirect + cookie; app KHÔNG dùng lại được vì xác thực bằng
 * Bearer token. Ở đây lấy id_token qua expo-auth-session rồi gửi lên
 * /api/v1/auth/token/google để đổi lấy cặp token của hệ thống.
 *
 * QUAN TRỌNG: expo-auth-session yêu cầu client id ĐÚNG NỀN TẢNG đang chạy —
 * Android bắt buộc androidClientId, iOS bắt buộc iosClientId; thiếu là hook
 * useIdTokenAuthRequest ném invariant làm sập cả màn hình. Web Client ID KHÔNG
 * thay thế được trên thiết bị. Vì vậy: nút LUÔN hiển thị (giống web), nhưng chỉ
 * mount phần gọi hook khi có client id đúng nền tảng; nếu chưa cấu hình thì bấm
 * vào báo rõ, không crash.
 */

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

const platformClientId =
  Platform.OS === 'android'
    ? ANDROID_CLIENT_ID
    : Platform.OS === 'ios'
      ? IOS_CLIENT_ID
      : WEB_CLIENT_ID;

/** Đã cấu hình client id đúng nền tảng thì luồng Google mới chạy thật được. */
export const googleReady = Boolean(platformClientId);

/** Nút hiển thị dùng chung, tách khỏi hook để nhánh chưa cấu hình cũng vẽ được. */
function GoogleButtonView({
  onPress,
  loading,
  disabled,
}: {
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
        tat && { opacity: 0.6 },
        pressed && !tat && { backgroundColor: colors.surfaceMuted },
      ]}>
      {loading ? (
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

export function GoogleButton({ onError }: { onError?: (message: string) => void }) {
  if (googleReady) return <GoogleButtonInner onError={onError} />;
  // Chưa cấu hình client id cho nền tảng này: vẫn hiện nút như web, nhưng báo rõ
  // khi bấm thay vì gọi hook (sẽ crash).
  return (
    <GoogleButtonView
      onPress={() =>
        onError?.(
          'Đăng nhập Google chưa sẵn sàng trên bản này — cần cấu hình Google Client ID cho Android/iOS.',
        )
      }
    />
  );
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
      setDangChay(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <GoogleButtonView
      loading={dangChay}
      disabled={!request}
      onPress={() => {
        setDangChay(true);
        void promptAsync();
      }}
    />
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
