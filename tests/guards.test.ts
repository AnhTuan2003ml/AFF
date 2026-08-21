import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { isGuestAppPath, requireApiUser, requireRoles } from "../src/auth/guards.js";
import type { CurrentUser } from "../src/types/fastify.js";

function mockUser(role: CurrentUser["role"]): CurrentUser {
  return {
    id: "u1",
    email: "u@example.com",
    fullName: "U",
    role,
    status: "ACTIVE",
    referralCode: "REF1",
    avatarUrl: "",
  };
}

describe("Guard phân quyền admin", () => {
  it("user thường không truy cập được khu vực chỉ dành cho admin", async () => {
    const request = { currentUser: mockUser("USER") } as unknown as FastifyRequest;
    const reply = { redirect: vi.fn() } as unknown as FastifyReply;
    const guard = requireRoles("SUPER_ADMIN", "ADMIN");
    await expect(guard(request, reply)).rejects.toThrow(/quyền/i);
  });

  it("cho phép SUPER_ADMIN và ADMIN đi qua", async () => {
    const reply = { redirect: vi.fn() } as unknown as FastifyReply;
    const guard = requireRoles("SUPER_ADMIN", "ADMIN");
    await expect(
      guard({ currentUser: mockUser("SUPER_ADMIN") } as unknown as FastifyRequest, reply),
    ).resolves.toBeUndefined();
    await expect(
      guard({ currentUser: mockUser("ADMIN") } as unknown as FastifyRequest, reply),
    ).resolves.toBeUndefined();
  });

  it("chưa đăng nhập bị từ chối API admin", async () => {
    const request = { currentUser: null } as unknown as FastifyRequest;
    await expect(requireApiUser(request)).rejects.toThrow(/đăng nhập/i);
  });
});

describe("Trang /app mở cho khách (isGuestAppPath)", () => {
  it("trang chủ, Khám phá, Hỗ trợ và dữ liệu chung đi kèm mở cho GET của khách", () => {
    for (const url of [
      "/app",
      "/app/",
      "/app?utm=x",
      "/app/promo-products?list=best",
      "/app/discover",
      "/app/discover?list=recommend",
      "/app/discover/offer-products?list=best&page=2",
      "/app/support",
      "/app/support?orderId=123",
    ]) {
      expect(isGuestAppPath("GET", url), url).toBe(true);
    }
    expect(isGuestAppPath("HEAD", "/app/discover")).toBe(true);
  });

  it("ví, đơn, rút tiền, API hỗ trợ riêng tư… vẫn bắt đăng nhập", () => {
    for (const url of [
      "/app/wallet",
      "/app/orders",
      "/app/withdrawals",
      "/app/settings",
      "/app/support/messages",
      "/app/support/latest",
      "/app/support/unread",
      "/app/discover/anything-else",
      "/app/discoverX",
    ]) {
      expect(isGuestAppPath("GET", url), url).toBe(false);
    }
  });

  it("mọi phương thức ghi đều bắt đăng nhập, kể cả trên đường dẫn khách", () => {
    expect(isGuestAppPath("POST", "/app/support")).toBe(false);
    expect(isGuestAppPath("POST", "/app/support/requests")).toBe(false);
    expect(isGuestAppPath("DELETE", "/app")).toBe(false);
  });
});
