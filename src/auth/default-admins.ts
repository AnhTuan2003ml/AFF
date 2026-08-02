/**
 * Danh sách admin mặc định — hardcode trực tiếp trong mã nguồn để LUÔN có
 * hiệu lực trên bất kỳ máy nào chạy ứng dụng này (triển khai lại, máy mới...),
 * không phụ thuộc cấu hình .env của từng môi trường.
 *
 * Tài khoản vẫn là một dòng bình thường trong bảng users (hash Argon2id),
 * không có cơ chế xác thực đặc biệt nào khác.
 *
 * - Tài khoản đã tồn tại: chỉ đồng bộ role/trạng thái, KHÔNG bao giờ đụng
 *   mật khẩu hiện tại (dù initialPassword ở đây là gì).
 * - Tài khoản chưa tồn tại (vd máy mới, DB mới): được tạo với initialPassword
 *   bên dưới làm mật khẩu đăng nhập ban đầu — đổi được ngay sau đó trong
 *   trang Tài khoản, không bị ghi đè lại ở lần khởi động sau.
 */
export interface DefaultAdmin {
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN";
  initialPassword: string;
}

export const DEFAULT_ADMINS: readonly DefaultAdmin[] = [
  {
    email: "tuankkffdnc@gmail.com",
    name: "Quản trị hệ thống",
    role: "SUPER_ADMIN",
    initialPassword: "AnhTuan2003@",
  },
  {
    email: "hoangngochiep62@gmail.com",
    name: "Quản trị viên",
    role: "SUPER_ADMIN",
    initialPassword: "HHiep2003@",
  },
];
