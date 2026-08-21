import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { ApiError, apiBaseUrl, apiFetch } from './client';
import { clearTokens, saveTokens } from './storage';

/**
 * Các lệnh xác thực, ánh xạ 1-1 với nhánh /api/v1/auth/token/* ở backend
 * (src/routes/api/auth.ts). Nhánh này không đặt cookie và được miễn kiểm tra
 * CSRF, nên app gọi thẳng được.
 */

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  /** URL ảnh đại diện (thường là ảnh Google). Trống = dùng chữ cái đầu. */
  avatarUrl: string;
}

interface TokenResponse {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  user: AuthUser;
}

async function keepTokens(
  response: TokenResponse,
  remember = true,
): Promise<AuthUser> {
  await saveTokens(
    {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    },
    remember,
  );
  return response.user;
}

export async function login(
  email: string,
  password: string,
  remember = true,
): Promise<AuthUser> {
  const response = await apiFetch<TokenResponse>('/api/v1/auth/token', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  return keepTokens(response, remember);
}

/**
 * Đăng nhập bằng Google — DÙNG LẠI đúng luồng Google của máy chủ web.
 *
 * Mở `/auth/google?flow=mobile` trong trình duyệt hệ thống; máy chủ chạy trọn
 * luồng OAuth (đúng Web Client ID của web), rồi thay vì đặt cookie web, nó cấp
 * cặp Bearer token và chuyển hướng về deep-link của app kèm token ở fragment.
 * Nhờ vậy KHÔNG cần Android/iOS Client ID và chạy được cả trong Expo Go.
 */
export async function loginWithGoogleWeb(): Promise<void> {
  const redirectUri = makeRedirectUri({ scheme: 'shoptik' });
  const startUrl =
    `${apiBaseUrl}/auth/google?flow=mobile&redirect_uri=` +
    encodeURIComponent(redirectUri);
  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    throw new ApiError('GOOGLE_CANCELLED', 'Đã hủy đăng nhập Google.', 0);
  }
  // Token nằm ở fragment (#...) để không lọt vào log máy chủ.
  const hash = result.url.split('#')[1] ?? '';
  const params = new URLSearchParams(hash);
  const err = params.get('error');
  if (err) throw new ApiError('GOOGLE_FAILED', err, 0);
  const accessToken = params.get('accessToken');
  const refreshToken = params.get('refreshToken');
  if (!accessToken || !refreshToken) {
    throw new ApiError(
      'GOOGLE_FAILED',
      'Không nhận được phiên đăng nhập từ Google.',
      0,
    );
  }
  await saveTokens({ accessToken, refreshToken }, true);
}

/** Bước 1 của đăng ký — backend gửi mã OTP 6 số về email. */
export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  passwordConfirm: string;
  referralCode?: string;
  acceptPolicies: boolean;
}): Promise<void> {
  await apiFetch('/api/v1/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
  });
}

/** Bước 2 của đăng ký — nhập mã OTP là có token luôn, khỏi đăng nhập lại. */
export async function verifyEmail(
  email: string,
  code: string,
): Promise<AuthUser> {
  const response = await apiFetch<TokenResponse>(
    '/api/v1/auth/token/verify-email',
    { method: 'POST', body: { email, code }, auth: false },
  );
  return keepTokens(response);
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

export async function resetPassword(input: {
  email: string;
  code: string;
  password: string;
}): Promise<void> {
  await apiFetch('/api/v1/auth/reset-password', {
    method: 'POST',
    body: input,
    auth: false,
  });
}

/** Đăng xuất đúng thiết bị này. Xóa token cục bộ kể cả khi mạng lỗi. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/v1/auth/token/revoke', { method: 'POST' });
  } finally {
    await clearTokens();
  }
}
