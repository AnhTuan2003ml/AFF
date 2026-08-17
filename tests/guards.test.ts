import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireApiUser, requireRoles } from "../src/auth/guards.js";
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
