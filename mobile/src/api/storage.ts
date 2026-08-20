import * as SecureStore from 'expo-secure-store';

/**
 * Nơi cất cặp token của phiên đăng nhập.
 *
 * Dùng expo-secure-store chứ không phải AsyncStorage: trên iOS nó nằm trong
 * Keychain, trên Android nằm trong Keystore — cả hai đều được hệ điều hành mã
 * hóa và không đọc được từ bản sao lưu thường. Token ở đây tương đương mật
 * khẩu, để trong AsyncStorage là để dưới dạng chữ thường trong sandbox app.
 */

const ACCESS_KEY = 'shoptik.accessToken';
const REFRESH_KEY = 'shoptik.refreshToken';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ]);
}

export async function readTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
