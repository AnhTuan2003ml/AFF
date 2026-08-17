import "fastify";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: "USER" | "SUPPORT" | "FINANCE" | "RISK" | "ADMIN" | "AUDITOR" | "SUPER_ADMIN";
  status: "PENDING_EMAIL" | "ACTIVE" | "LOCKED" | "DISABLED";
  referralCode: string;
  avatarUrl: string;
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
    sessionToken: string | null;
    csrfToken: string;
  }

  interface FastifyContextConfig {
    csrf?: boolean;
    auth?: boolean;
  }
}
