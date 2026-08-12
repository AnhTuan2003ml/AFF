export function formatVnd(value: number | bigint | string): string {
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  return `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0)} ₫`;
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
  }).format(date);
}

// Nhãn tiếng Việt cho mã hành động trong audit_logs — người xem không phải
// đọc mã như CASHBACK_APPROVED hay ADMIN_ENV_SYNC_CREATE.
const AUDIT_ACTION_LABELS: Record<string, string> = {
  BANK_ACCOUNT_ADDED: "Thêm tài khoản ngân hàng",
  BANK_VERIFIED: "Xác minh tài khoản ngân hàng",
  BANK_REJECTED: "Từ chối tài khoản ngân hàng",
  BUSINESS_CONFIG_UPDATED: "Cập nhật cấu hình nghiệp vụ",
  CASHBACK_APPROVED: "Duyệt hoàn tiền đơn hàng",
  CASHBACK_AUTO_APPROVED: "Tự động duyệt hoàn tiền đơn hàng",
  CASHBACK_REJECTED: "Từ chối hoàn tiền đơn hàng",
  CONTENT_ITEM_CREATED: "Tạo nội dung mới",
  CONTENT_ITEM_STATUS_CHANGED: "Đổi trạng thái nội dung",
  CONTENT_ITEM_UPDATED: "Sửa nội dung",
  CONTENT_ITEM_DELETED: "Xóa nội dung",
  ORDERS_IMPORTED: "Nhập báo cáo đơn hàng",
  PLATFORM_SYNC_CONFIG_UPDATED: "Đổi cấu hình đồng bộ sàn",
  PLATFORM_SYNC_RUN: "Chạy đồng bộ báo cáo sàn",
  TICKET_STATUS_CHANGED: "Cập nhật yêu cầu hỗ trợ",
  TICKET_REPLIED: "Phản hồi yêu cầu hỗ trợ",
  USER_CREATED_BY_ADMIN: "Tạo tài khoản người dùng",
  USER_DELETED: "Xóa tài khoản người dùng",
  USER_ROLE_CHANGED: "Đổi vai trò người dùng",
  USER_ACTIVE: "Mở khóa tài khoản người dùng",
  USER_LOCKED: "Khóa tài khoản người dùng",
  WITHDRAWAL_CREATED: "Tạo yêu cầu rút tiền",
  WITHDRAWAL_APPROVED: "Duyệt yêu cầu rút tiền",
  WITHDRAWAL_REJECTED: "Từ chối yêu cầu rút tiền",
  ADMIN_ENV_SYNC_CREATE: "Khởi tạo tài khoản quản trị hệ thống",
  ADMIN_ENV_SYNC_UPDATE: "Cập nhật tài khoản quản trị hệ thống",
  ADMIN_ENV_PASSWORD_RESET: "Đặt lại mật khẩu quản trị hệ thống",
  ADMIN_ENV_REVOKE: "Thu hồi quyền quản trị hệ thống",
  ADMIN_DEFAULT_BOOTSTRAP_CREATE: "Khởi tạo quản trị viên mặc định",
  ADMIN_DEFAULT_BOOTSTRAP_SYNC: "Đồng bộ quản trị viên mặc định",
  MISSION_CLAIM_SENT: "Gửi yêu cầu nhận thưởng nhiệm vụ",
  MISSION_CLAIM_APPROVED: "Duyệt thưởng nhiệm vụ",
  MISSION_CLAIM_REJECTED: "Từ chối thưởng nhiệm vụ",
  MISSION_DEFINITION_CREATED: "Tạo mốc nhiệm vụ",
  MISSION_DEFINITION_UPDATED: "Cập nhật mốc nhiệm vụ",
  MISSION_DEFINITION_DELETED: "Xóa mốc nhiệm vụ",
};

const AUDIT_ACTION_NEGATIVE = new Set([
  "BANK_REJECTED",
  "CASHBACK_REJECTED",
  "USER_DELETED",
  "USER_LOCKED",
  "WITHDRAWAL_REJECTED",
  "ADMIN_ENV_REVOKE",
  "CONTENT_ITEM_DELETED",
]);

const AUDIT_ACTION_POSITIVE = new Set([
  "BANK_ACCOUNT_ADDED",
  "BANK_VERIFIED",
  "CASHBACK_APPROVED",
  "CASHBACK_AUTO_APPROVED",
  "USER_CREATED_BY_ADMIN",
  "USER_ACTIVE",
  "WITHDRAWAL_APPROVED",
]);

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export type AuditTone = "positive" | "negative" | "neutral";

export function auditActionTone(action: string): AuditTone {
  if (AUDIT_ACTION_NEGATIVE.has(action)) return "negative";
  if (AUDIT_ACTION_POSITIVE.has(action)) return "positive";
  return "neutral";
}

const AUDIT_TONE_LABELS: Record<AuditTone, string> = {
  positive: "Duyệt / Mở",
  negative: "Khóa / Từ chối",
  neutral: "Cập nhật",
};

export function formatAuditTone(tone: string): string {
  return AUDIT_TONE_LABELS[tone as AuditTone] ?? tone;
}

// Nhãn tiếng Việt cho đối tượng bị tác động (target_type) trong audit_logs —
// dùng cho cột "Đối tượng" và bộ lọc "Nhóm hành động".
const AUDIT_TARGET_TYPE_LABELS: Record<string, string> = {
  USER: "Tài khoản người dùng",
  ORDER: "Đơn hàng",
  ORDER_BATCH: "Lô nhập đơn hàng",
  BANK_ACCOUNT: "Tài khoản ngân hàng",
  WITHDRAWAL: "Yêu cầu rút tiền",
  SUPPORT_TICKET: "Yêu cầu hỗ trợ",
  CONTENT_ITEM: "Nội dung Khám phá",
  BUSINESS_CONFIG: "Cấu hình nghiệp vụ",
  ADMIN_ACCOUNT: "Tài khoản quản trị hệ thống",
};

export function formatAuditTargetType(targetType: string): string {
  return AUDIT_TARGET_TYPE_LABELS[targetType] ?? targetType;
}

export const AUDIT_TARGET_TYPES = Object.keys(AUDIT_TARGET_TYPE_LABELS);
