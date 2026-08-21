import { apiFetch } from './client';

/**
 * Ngân hàng nhận tiền và lệnh rút — ánh xạ với src/routes/api/me.ts.
 *
 * Cả hai nghiệp vụ đều đi HAI bước và cùng một hình dạng: bước một trả 202 kèm
 * id của yêu cầu, backend gửi mã OTP về email; bước hai gửi mã lên để xác nhận.
 * Thiết kế này cố ý — thêm tài khoản nhận tiền và rút tiền là hai thao tác mà
 * nếu phiên bị chiếm thì mất tiền thật, nên bắt buộc phải qua email.
 */

export interface BankAccount {
  id: string;
  bank_code: string;
  account_last4: string;
  account_name_masked: string;
  status: string;
  verified_at: string | null;
  created_at: string;
}

export interface SupportedBank {
  code: string;
  name: string;
  shortName?: string;
}

export async function layNganHang() {
  return apiFetch<{ data: BankAccount[]; supportedBanks: SupportedBank[] }>(
    '/api/v1/me/bank-accounts',
  );
}

/** Bước 1 — backend gửi OTP về email, trả về requestId để xác nhận ở bước 2. */
export function themNganHang(input: {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}) {
  return apiFetch<{ requestId: string; status: string; message: string }>(
    '/api/v1/me/bank-accounts',
    { method: 'POST', body: input },
  );
}

export function xacNhanNganHang(requestId: string, code: string) {
  return apiFetch<{ bankAccountId: string; status: string }>(
    `/api/v1/me/bank-accounts/${requestId}/confirm`,
    { method: 'POST', body: { code } },
  );
}

/** Bước 1 của rút tiền — cũng trả OTP, chưa trừ tiền. */
export function taoLenhRut(input: { bankAccountId: string; amountVnd: number }) {
  return apiFetch<{ intentId: string; status: string; message: string }>(
    '/api/v1/me/withdrawals',
    { method: 'POST', body: input },
  );
}

export function xacNhanRut(intentId: string, code: string) {
  return apiFetch<{ withdrawalId: string; status: string; message: string }>(
    `/api/v1/me/withdrawals/${intentId}/confirm`,
    { method: 'POST', body: { code } },
  );
}

export function doiTen(fullName: string) {
  return apiFetch<unknown>('/api/v1/me', { method: 'PATCH', body: { fullName } });
}

/** Đăng xuất trên MỌI thiết bị (thu hồi tất cả phiên). */
export async function dangXuatMoiThietBi(): Promise<void> {
  await apiFetch<unknown>('/api/v1/me/sessions/revoke-all', { method: 'POST' });
}

/**
 * Xóa tài khoản (xóa mềm). `forfeitBalance=false` mà còn số dư/lệnh rút sẽ bị
 * backend chặn — khi đó hỏi lại rồi gọi với `true` để bỏ lại số dư.
 */
export function xoaTaiKhoan(forfeitBalance: boolean) {
  return apiFetch<{ status: string; forfeitedVnd: number }>('/api/v1/me', {
    method: 'DELETE',
    body: { forfeitBalance },
  });
}

export interface PhienDangNhap {
  id: string;
  client: string;
  created_at: string;
  last_seen_at: string;
  is_current: boolean;
}

/** Danh sách thiết bị/phiên đang đăng nhập. */
export async function layPhien(): Promise<PhienDangNhap[]> {
  const r = await apiFetch<{ data: PhienDangNhap[] }>('/api/v1/me/sessions');
  return r.data ?? [];
}

/** Báo một đơn "chưa ghi nhận" — đổ vào chat hỗ trợ như web. */
export function baoChuaGhiNhan(orderId: string, description: string) {
  return apiFetch<{ id: string; status: string }>(
    '/api/v1/support/missing-order',
    { method: 'POST', body: { orderId, description } },
  );
}
