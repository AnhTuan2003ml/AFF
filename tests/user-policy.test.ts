import { describe, expect, it } from "vitest";
import {
  USER_POLICY_VERSION,
  buildUserPolicy,
  renderUserPolicyEmail,
  type UserPolicyFacts,
} from "../src/services/user-policy.js";

function facts(overrides: Partial<UserPolicyFacts> = {}): UserPolicyFacts {
  return {
    appName: "ShopTik",
    appOrigin: "https://shoptik.example/",
    buyerCashbackPercent: 80,
  smallOrderThresholdVnd: 25_000,
  smallOrderBuyerPercent: 80,
    cashbackHoldDays: 15,
    affiliateAttributionDays: 30,
    minWithdrawAmountVnd: 100_000,
    ...overrides,
  };
}

describe("Chính sách người dùng", () => {
  it("nêu đúng các con số đang có hiệu lực thay vì viết cứng", () => {
    const policy = buildUserPolicy(facts());
    const text = policy.sections
      .flatMap((section) => [...section.paragraphs, ...section.items])
      .join("\n");

    expect(text).toContain("80%");
    expect(text).toContain("15 ngày");
    expect(text).toContain("30 ngày");
    expect(text).toContain("100.000");
  });

  it("nói rõ tiền vào ví ngay khi số ngày giữ bằng 0", () => {
    const policy = buildUserPolicy(facts({ cashbackHoldDays: 0 }));
    const text = policy.sections
      .flatMap((section) => section.items)
      .join("\n");
    expect(text).toContain("ngay khi sàn ghi nhận đơn Hoàn thành");
    expect(text).toContain("không có thời gian chờ");
    expect(text).not.toContain("giữ thêm");
  });

  it("dựng URL tuyệt đối không bị lặp dấu gạch chéo", () => {
    expect(buildUserPolicy(facts()).url).toBe(
      "https://shoptik.example/chinh-sach-nguoi-dung",
    );
  });

  it("email chính sách mang đủ tiêu đề, phiên bản và toàn bộ mục", () => {
    const mail = renderUserPolicyEmail({
      fullName: "Nguyễn Văn A",
      facts: facts(),
    });
    const policy = buildUserPolicy(facts());

    expect(mail.subject).toContain(USER_POLICY_VERSION);
    expect(mail.text).toContain("Nguyễn Văn A");
    for (const section of policy.sections) {
      expect(mail.text).toContain(section.heading);
    }
    expect(mail.html).toContain(policy.url);
    expect(mail.text).toContain(
      "không bao giờ hỏi mật khẩu, mã PIN hay OTP ngân hàng",
    );
  });

  it("thoát ký tự HTML trong tên người nhận", () => {
    const mail = renderUserPolicyEmail({
      fullName: '<script>alert("x")</script>',
      facts: facts(),
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
