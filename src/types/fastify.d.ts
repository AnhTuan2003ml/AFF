import "fastify";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: "USER" | "SUPPORT" | "FINANCE" | "RISK" | "ADMIN" | "AUDITOR" | "SUPER_ADMIN";
  status: "PENDING_EMAIL" | "ACTIVE" | "LOCKED" | "DISABLED";
  referralCode: string;
  avatarUrl: string;
  isSpecialPartner?: boolean;
  /** Có đặt mật khẩu không. Tài khoản đăng nhập Google thuần = false → xác nhận
   *  xóa tài khoản bằng email thay vì mật khẩu. */
  hasPassword?: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
    sessionToken: string | null;
    /**
     * Phiên hiện tại đến từ đâu: cookie của trình duyệt hay header
     * Authorization của app di động. `null` là chưa đăng nhập.
     * CSRF chỉ có nghĩa với "cookie" — xem auth/csrf.ts.
     */
    authScheme: "cookie" | "bearer" | null;
    csrfToken: string;
  }

  interface FastifyContextConfig {
    csrf?: boolean;
    auth?: boolean;
  }
}
