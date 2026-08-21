import { apiFetch } from './client';
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
