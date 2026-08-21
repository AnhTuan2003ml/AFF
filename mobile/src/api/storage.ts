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
const REMEMBER_KEY = 'shoptik.remember';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * `remember` giữ đúng ngữ nghĩa "Ghi nhớ đăng nhập" của web: SecureStore không
 * có ô nhớ chỉ-trong-phiên, nên khi người dùng KHÔNG chọn ghi nhớ, ta vẫn lưu
 * token để phiên hiện tại chạy được, nhưng đánh dấu cờ '0' để lần mở app sau
 * `useSession` xóa token và bắt đăng nhập lại. Không truyền `remember` (làm mới
 * token nền) thì giữ nguyên cờ cũ.
 */
export async function saveTokens(
  tokens: StoredTokens,
  remember?: boolean,
): Promise<void> {
  const writes: Promise<unknown>[] = [
    SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
  ];
  if (remember !== undefined) {
    writes.push(SecureStore.setItemAsync(REMEMBER_KEY, remember ? '1' : '0'));
  }
  await Promise.all(writes);
}

/** Mặc định true để các phiên cũ (chưa có cờ) vẫn được ghi nhớ như trước. */
export async function readRemember(): Promise<boolean> {
  return (await SecureStore.getItemAsync(REMEMBER_KEY)) !== '0';
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
    SecureStore.deleteItemAsync(REMEMBER_KEY),
  ]);
}
