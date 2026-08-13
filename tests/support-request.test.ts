import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testConfig } from "./helpers.js";
import { listSupportChatMessages } from "../src/services/support-chat.js";
import { submitSupportRequest } from "../src/services/support-request.js";
import type { Database } from "../src/db.js";

// Form hỗ trợ theo mẫu — kiểm tra validate và tin nhắn chuẩn hóa được lưu
// vào hội thoại chat. Slack tắt trong testConfig nên không có gọi mạng.

let db: Database;
let close: () => Promise<void>;
let userId: string;
let otherUserId: string;

async function createUser(email: string, referral: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO users (email, full_name, status, role, referral_code)
     VALUES ($1, 'Khach Hang', 'ACTIVE', 'USER', $2)
     RETURNING id`,
    [email, referral],
  );
  return result.rows[0]!.id;
}

async function createOrder(ownerId: string): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO orders (
       user_id, platform, platform_order_id, status,
       order_amount_vnd, commission_vnd, cashback_vnd
     ) VALUES ($1, 'SHOPEE', 'SP123456', 'APPROVED', 200000, 10000, 5000)
     RETURNING id`,
    [ownerId],
  );
  return result.rows[0]!.id;
}

beforeEach(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  close = testDb.close;
  userId = await createUser("khach@shoptik.vn", "SUPREF001");
  otherUserId = await createUser("khac@shoptik.vn", "SUPREF002");
});

afterEach(async () => {
  await close();
});

describe("submitSupportRequest", () => {
  it("vấn đề không gắn đơn: lưu tin chuẩn hóa vào hội thoại", async () => {
    const message = await submitSupportRequest(db, testConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      topic: "WITHDRAWAL",
      description: "Mình rút tiền từ hôm qua mà chưa thấy về tài khoản.",
    });
    expect(message.authorRole).toBe("USER");
    expect(message.body).toContain(
      "[Yêu cầu hỗ trợ] Rút tiền, tài khoản ngân hàng",
    );
    expect(message.body).toContain("chưa thấy về tài khoản");

    const messages = await listSupportChatMessages(db, userId);
    expect(messages).toHaveLength(1);
  });

  it("đơn chưa ghi nhận: bắt buộc mã đơn trên sàn", async () => {
    await expect(
      submitSupportRequest(db, testConfig(), {
        userId,
        userEmail: "khach@shoptik.vn",
        topic: "ORDER_NOT_RECORDED",
        description: "Đã mua từ hôm qua nhưng chưa thấy đơn trong ShopTik.",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ORDER_CODE" });

    const message = await submitSupportRequest(db, testConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      topic: "ORDER_NOT_RECORDED",
      orderCode: "2508ABCXYZ",
      description: "Đã mua từ hôm qua nhưng chưa thấy đơn trong ShopTik.",
    });
    expect(message.body).toContain("Mã đơn trên sàn: #2508ABCXYZ");
  });

  it("vấn đề gắn đơn: mô tả đơn của chính người dùng trong tin nhắn", async () => {
    const orderId = await createOrder(userId);
    const message = await submitSupportRequest(db, testConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      topic: "CASHBACK_ISSUE",
      orderKey: `ORDER:${orderId}`,
      description: "Tiền hoàn hiển thị thấp hơn lúc đặt mua.",
    });
    expect(message.body).toContain("Đơn Shopee #SP123456");
    expect(message.body).toContain("Đã duyệt");
  });

  it("không cho gắn đơn của người khác hoặc khóa không hợp lệ", async () => {
    const foreignOrderId = await createOrder(otherUserId);
    const base = {
      userId,
      userEmail: "khach@shoptik.vn",
      topic: "CASHBACK_ISSUE",
      description: "Tiền hoàn hiển thị thấp hơn lúc đặt mua.",
    };
    await expect(
      submitSupportRequest(db, testConfig(), {
        ...base,
        orderKey: `ORDER:${foreignOrderId}`,
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    await expect(
      submitSupportRequest(db, testConfig(), {
        ...base,
        orderKey: "ORDER:khong-phai-uuid",
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    // Bắt buộc chọn đơn với loại vấn đề này.
    await expect(
      submitSupportRequest(db, testConfig(), base),
    ).rejects.toMatchObject({ code: "ORDER_REQUIRED" });
    expect(await listSupportChatMessages(db, userId)).toHaveLength(0);
  });

  it("chặn loại vấn đề lạ và mô tả quá ngắn", async () => {
    await expect(
      submitSupportRequest(db, testConfig(), {
        userId,
        userEmail: "khach@shoptik.vn",
        topic: "KHONG_TON_TAI",
        description: "Mô tả đủ dài để qua bước kiểm tra.",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TOPIC" });
    await expect(
      submitSupportRequest(db, testConfig(), {
        userId,
        userEmail: "khach@shoptik.vn",
        topic: "ACCOUNT",
        description: "ngắn quá",
      }),
    ).rejects.toMatchObject({ code: "INVALID_DESCRIPTION" });
  });

  it("lưu email nhận phản hồi vào hội thoại (chuẩn hóa chữ thường)", async () => {
    await submitSupportRequest(db, testConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      topic: "ACCOUNT",
      description: "Mình muốn đổi email đăng nhập thì làm thế nào?",
      notifyEmail: " Nhan.PhanHoi@Example.com ",
    });
    const row = await db.query<{ notify_email: string }>(
      `SELECT notify_email FROM support_conversations WHERE user_id = $1`,
      [userId],
    );
    expect(row.rows[0]!.notify_email).toBe("nhan.phanhoi@example.com");
  });

  it("chặn email nhận phản hồi sai định dạng", async () => {
    await expect(
      submitSupportRequest(db, testConfig(), {
        userId,
        userEmail: "khach@shoptik.vn",
        topic: "ACCOUNT",
        description: "Mô tả đủ dài để qua bước kiểm tra.",
        notifyEmail: "khong-phai-email",
      }),
    ).rejects.toMatchObject({ code: "INVALID_NOTIFY_EMAIL" });
  });

  it("lượt mua chưa có đơn (INTENT) cũng gắn được vào yêu cầu", async () => {
    const link = await db.query<{ id: string }>(
      `INSERT INTO affiliate_links (
         user_id, platform, click_id, original_url, normalized_url,
         affiliate_url, sub_id, campaign, product_name
       ) VALUES (
         $1, 'SHOPEE', 'clicktest01', 'https://shopee.vn/x',
         'https://shopee.vn/x', 'https://s.shopee.vn/x', 'sub', 'instantbuy',
         'Tai nghe chống ồn'
       ) RETURNING id`,
      [userId],
    );
    const message = await submitSupportRequest(db, testConfig(), {
      userId,
      userEmail: "khach@shoptik.vn",
      topic: "OTHER",
      orderKey: `INTENT:${link.rows[0]!.id}`,
      description: "Lượt mua này của mình có được ghi nhận không?",
    });
    expect(message.body).toContain("Lượt mua Shopee ngày");
    expect(message.body).toContain("Tai nghe chống ồn");
    expect(message.body).toContain("Chờ sàn xác nhận");
  });
});
