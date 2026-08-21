import { apiFetch } from './client';
import type { AuthUser } from './auth';

/**
 * Dữ liệu tài khoản, ví và đơn hàng — ánh xạ 1-1 với nhánh /api/v1/me/* ở
 * backend (src/routes/api/account.ts và me.ts). Tên trường giữ nguyên dạng
 * snake_case như SQL trả về; đổi tên ở đây chỉ tạo thêm một lớp dịch phải nhớ.
 */

export interface WalletBalances {
  available: number;
  pending: number;
  /** Đang giữ cho lệnh rút đang xử lý. */
  held: number;
  /** Tổng đã chuyển về ngân hàng. */
  paid: number;
}

export interface Me {
  user: AuthUser;
  balances: WalletBalances;
  /** Phần trăm hoa hồng chia lại cho người mua — web hiện "Hoàn tới X%". */
  cashbackPercent?: number;
  /** Số đơn đã được duyệt/đã trả, dùng cho dòng "Đã mua qua ShopTik". */
  purchasedProducts?: number;
  minWithdrawalVnd?: number;
}

export type OrderStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CANCELLED'
  | 'PAID'
  | string;

export interface Order {
  id: string;
  platform: string;
  platform_order_id: string | null;
  status: OrderStatus;
  order_amount_vnd: number | null;
  commission_vnd: number | null;
  cashback_vnd: number | null;
  purchased_at: string | null;
  approved_at: string | null;
  created_at: string;
  completed_at: string | null;
  cancel_reason: string | null;
  cashback_available_at: string | null;
  cashback_released_at: string | null;
  product_name: string | null;
  product_image_url: string | null;
  product_price_vnd: number | null;
  product_original_price_vnd: number | null;
}

export interface LedgerRow {
  id: string;
  type: string;
  description: string | null;
  code: string;
  direction: 'DEBIT' | 'CREDIT';
  amount_vnd: number;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  amount_vnd: number;
  bank_code: string | null;
  bank_last4: string | null;
  status: string;
  rejection_reason: string | null;
  requested_at: string;
  paid_at: string | null;
}

export function layMe() {
  return apiFetch<Me>('/api/v1/me');
}

export async function layDonHang(): Promise<Order[]> {
  const r = await apiFetch<{ data: Order[] }>('/api/v1/me/orders');
  return r.data ?? [];
}

export function layVi() {
  return apiFetch<{ balances: WalletBalances; history: LedgerRow[] }>(
    '/api/v1/me/wallet',
  );
}

export async function layLenhRut(): Promise<Withdrawal[]> {
  const r = await apiFetch<{ data: Withdrawal[] }>('/api/v1/me/withdrawals');
  return r.data ?? [];
}

export interface SupportMessage {
  id: string;
  authorRole: 'USER' | 'AGENT';
  body: string;
  createdAt: string;
}

/** Chat hỗ trợ — đồng bộ đúng thread Slack/DB như web. */
export async function layHoTro(): Promise<SupportMessage[]> {
  const r = await apiFetch<{ data: SupportMessage[] }>('/api/v1/support');
  return r.data ?? [];
}

/* ---------- Form hỗ trợ theo mẫu (giống trang /app/support của web) ---------- */

export interface SupportTopic {
  value: string;
  label: string;
  orderMode: 'list' | 'code' | 'none';
  orderRequired: boolean;
}

export interface SupportOrderOption {
  key: string;
  label: string;
}

export interface SupportExchangeMessage {
  body: string;
  createdAt: string;
}

export interface SupportFormData {
  topics: SupportTopic[];
  orderOptions: SupportOrderOption[];
  notifyEmail: string;
  latestRequest: SupportExchangeMessage | null;
  latestReply: SupportExchangeMessage | null;
  chatOnline: boolean;
}

/** Dữ liệu dựng form + yêu cầu/phản hồi mới nhất. Mở form = đã xem phản hồi. */
export function laySupportForm(): Promise<SupportFormData> {
  return apiFetch<SupportFormData>('/api/v1/support/form');
}

export interface SupportRequestInput {
  topic: string;
  orderKey?: string;
  orderCode?: string;
  description: string;
  notifyEmail?: string;
}

/** Gửi yêu cầu theo mẫu — cùng pipeline Slack/DB với web. */
export function guiYeuCauHoTro(input: SupportRequestInput): Promise<{ message: SupportMessage }> {
  return apiFetch<{ message: SupportMessage }>('/api/v1/support/requests', {
    method: 'POST',
    body: input,
  });
}

export function guiHoTro(body: string): Promise<SupportMessage> {
  return apiFetch<SupportMessage>('/api/v1/support', {
    method: 'POST',
    body: { body },
  });
}
