import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBearerToken } from "../src/auth/session.js";
import type { Database } from "../src/db.js";
import { sha256 } from "../src/lib/crypto.js";
import { deleteOwnAccount } from "../src/services/account-deletion.js";
import {
  issueMobileTokens,
  revokeMobileSessionByAccessToken,
  rotateMobileTokens,
} from "../src/services/mobile-token.js";
import { createTestDb, testConfig } from "./helpers.js";

const config = testConfig();
const request = {
  ip: "127.0.0.1",
  headers: { "user-agent": "ShopTik/1.0 (Android)" },
} as unknown as FastifyRequest;

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

let referralCounter = 0;

async function createUser(status = "ACTIVE"): Promise<string> {
  referralCounter += 1;
  const result = await db.query(
    `
      INSERT INTO users (email, full_name, password_hash, status, referral_code)
      VALUES ($1, $2, 'argon2-hash', $3, $4)
      RETURNING id
    `,
    [
      `khach${referralCounter}@example.com`,
      "Nguyễn Văn A",
      status,
      `REF${String(referralCounter).padStart(5, "0")}`,
    ],
  );
  return result.rows[0]?.id as string;
}

/**
 * Nạp tiền vào một ví của người dùng bằng bút toán cân bằng tối thiểu.
 * Bốn ví USER đã được trigger `users_create_wallet` tạo sẵn lúc INSERT users,
 * nên ở đây chỉ tra lại chứ không tạo mới.
 */
async function creditWallet(
  userId: string,
  code: "AVAILABLE" | "PENDING",
  amountVnd: number,
): Promise<void> {
  const userAccount = await db.query(
    `
      SELECT id FROM ledger_accounts
      WHERE owner_type = 'USER' AND owner_id = $1 AND code = $2
    `,
    [userId, code],
  );
  const systemAccount = await db.query(
    `
      SELECT id FROM ledger_accounts
      WHERE owner_type = 'SYSTEM' AND code = 'CASHBACK_CLEARING'
    `,
  );
  const transaction = await db.query(
    `
      INSERT INTO ledger_transactions (
        type, reference_type, reference_id, idempotency_key, description
      ) VALUES ('TEST', 'TEST', $1, $2, 'nạp ví cho test')
      RETURNING id
    `,
    [userId, `test:${code}:${userId}`],
  );
  const transactionId = transaction.rows[0]?.id as string;
  await db.query(
    `
      INSERT INTO ledger_entries (transaction_id, account_id, direction, amount_vnd)
      VALUES ($1, $2, 'CREDIT', $3), ($1, $4, 'DEBIT', $3)
    `,
    [
      transactionId,
      userAccount.rows[0]?.id,
      amountVnd,
      systemAccount.rows[0]?.id,
    ],
  );
}

describe("readBearerToken", () => {
  it("chỉ nhận đúng tiền tố Bearer và bỏ token rỗng", () => {
    expect(readBearerToken({ headers: { authorization: "Bearer abc123" } })).toBe(
      "abc123",
    );
    expect(readBearerToken({ headers: { authorization: "Bearer   " } })).toBeNull();
    expect(readBearerToken({ headers: { authorization: "Basic abc123" } })).toBeNull();
    expect(readBearerToken({ headers: {} })).toBeNull();
  });
});

describe("Phiên token cho app di động", () => {
  it("cấp cặp token và lưu đúng một dòng sessions kiểu mobile", async () => {
    const userId = await createUser();
    const tokens = await issueMobileTokens(db, config, request, userId);

    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.userId).toBe(userId);
    expect(tokens.expiresIn).toBe(config.MOBILE_ACCESS_TOKEN_TTL_MINUTES * 60);
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);

    const sessions = await db.query(
      "SELECT client, token_hash, refresh_token_hash FROM sessions WHERE user_id = $1",
      [userId],
    );
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.client).toBe("mobile");
    // Chỉ lưu bản băm — token thô không bao giờ nằm trong DB.
    expect(sessions.rows[0]?.token_hash).toBe(sha256(tokens.accessToken));
    expect(sessions.rows[0]?.refresh_token_hash).toBe(
      sha256(tokens.refreshToken),
    );
  });

  it("xoay cả hai token trên cùng một dòng khi làm mới", async () => {
    const userId = await createUser();
    const first = await issueMobileTokens(db, config, request, userId);
    const second = await rotateMobileTokens(db, config, first.refreshToken);

    expect(second.userId).toBe(userId);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Vẫn đúng một dòng: một thiết bị không được đẻ thêm phiên mỗi lần làm mới.
    const sessions = await db.query(
      "SELECT token_hash FROM sessions WHERE user_id = $1",
      [userId],
    );
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.token_hash).toBe(sha256(second.accessToken));
  });

  it("từ chối refresh token đã dùng một lần", async () => {
    const userId = await createUser();
    const first = await issueMobileTokens(db, config, request, userId);
    await rotateMobileTokens(db, config, first.refreshToken);

    await expect(
      rotateMobileTokens(db, config, first.refreshToken),
    ).rejects.toThrow(/hết hạn/i);
  });

  it("từ chối refresh token đã quá hạn", async () => {
    const userId = await createUser();
    const tokens = await issueMobileTokens(db, config, request, userId);
    await db.query(
      "UPDATE sessions SET refresh_expires_at = now() - interval '1 day' WHERE user_id = $1",
      [userId],
    );

    await expect(
      rotateMobileTokens(db, config, tokens.refreshToken),
    ).rejects.toThrow(/hết hạn/i);
  });

  it("từ chối làm mới khi tài khoản không còn hoạt động", async () => {
    const userId = await createUser();
    const tokens = await issueMobileTokens(db, config, request, userId);
    await db.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [
      userId,
    ]);

    await expect(
      rotateMobileTokens(db, config, tokens.refreshToken),
    ).rejects.toThrow(/hết hạn/i);
  });

  it("thu hồi phiên bằng access token đang cầm", async () => {
    const userId = await createUser();
    const tokens = await issueMobileTokens(db, config, request, userId);
    await revokeMobileSessionByAccessToken(db, tokens.accessToken);

    const sessions = await db.query(
      "SELECT revoked_at FROM sessions WHERE user_id = $1",
      [userId],
    );
    expect(sessions.rows[0]?.revoked_at).not.toBeNull();

    // Đã thu hồi thì refresh token đi kèm cũng chết theo.
    await expect(
      rotateMobileTokens(db, config, tokens.refreshToken),
    ).rejects.toThrow(/hết hạn/i);
  });
});

describe("Xóa tài khoản tự phục vụ", () => {
  it("chặn khi còn lệnh rút đang xử lý", async () => {
    const userId = await createUser();
    await db.query(
      `
        INSERT INTO withdrawals (
          user_id, amount_vnd, bank_code, bank_account_ciphertext,
          bank_name_ciphertext, bank_last4, status
        ) VALUES ($1, 100000, 'VCB', 'x', 'y', '1234', 'FUNDS_HELD')
      `,
      [userId],
    );

    await expect(
      deleteOwnAccount(db, { userId, forfeitBalance: true }),
    ).rejects.toThrow(/lệnh rút tiền chưa xử lý xong/i);

    const user = await db.query("SELECT status FROM users WHERE id = $1", [
      userId,
    ]);
    expect(user.rows[0]?.status).toBe("ACTIVE");
  });

  it("chặn khi ví còn tiền mà người dùng chưa xác nhận chấp nhận mất", async () => {
    const userId = await createUser();
    await creditWallet(userId, "AVAILABLE", 250000);

    await expect(
      deleteOwnAccount(db, { userId, forfeitBalance: false }),
    ).rejects.toThrow(/còn 250.000 đồng/i);
  });

  it("xóa mềm: gỡ danh tính, thu hồi phiên, xóa ngân hàng, giữ nguyên ledger", async () => {
    const userId = await createUser();
    await creditWallet(userId, "PENDING", 90000);
    await issueMobileTokens(db, config, request, userId);
    await db.query(
      `
        INSERT INTO auth_identities (user_id, provider, provider_subject)
        VALUES ($1, 'google', 'google-sub-1')
      `,
      [userId],
    );
    await db.query(
      `
        INSERT INTO user_bank_accounts (
          user_id, bank_code, account_number_ciphertext,
          account_name_ciphertext, account_last4, account_name_masked, status
        ) VALUES ($1, 'VCB', 'so-tk-ma-hoa', 'ten-ma-hoa', '4321', 'N*** V** A', 'VERIFIED')
      `,
      [userId],
    );

    const result = await deleteOwnAccount(db, { userId, forfeitBalance: true });
    expect(result.forfeitedVnd).toBe(90000);

    const user = await db.query(
      "SELECT status, email, full_name, password_hash, deleted_at, deletion_reason FROM users WHERE id = $1",
      [userId],
    );
    // Dùng chung quy ước xóa mềm với khu quản trị: DISABLED + deleted_at.
    expect(user.rows[0]?.status).toBe("DISABLED");
    expect(user.rows[0]?.deletion_reason).toMatch(/tự xóa/i);
    expect(user.rows[0]?.email).toBe(`deleted+${userId}@shoptik.invalid`);
    expect(user.rows[0]?.full_name).toBe("Người dùng đã xóa");
    expect(user.rows[0]?.password_hash).toBeNull();
    expect(user.rows[0]?.deleted_at).not.toBeNull();

    const sessions = await db.query(
      "SELECT revoked_at FROM sessions WHERE user_id = $1",
      [userId],
    );
    expect(sessions.rows.every((row) => row.revoked_at !== null)).toBe(true);

    const identities = await db.query(
      "SELECT id FROM auth_identities WHERE user_id = $1",
      [userId],
    );
    expect(identities.rows).toHaveLength(0);

    const bank = await db.query(
      "SELECT status, account_number_ciphertext, account_last4 FROM user_bank_accounts WHERE user_id = $1",
      [userId],
    );
    expect(bank.rows[0]?.status).toBe("DISABLED");
    expect(bank.rows[0]?.account_number_ciphertext).toBe("");
    expect(bank.rows[0]?.account_last4).toBe("****");

    // Chứng từ đối soát phải còn nguyên vẹn sau khi xóa danh tính.
    const entries = await db.query(
      `
        SELECT count(*)::int AS count
        FROM ledger_entries e
        JOIN ledger_accounts a ON a.id = e.account_id
        WHERE a.owner_type = 'USER' AND a.owner_id = $1
      `,
      [userId],
    );
    expect(entries.rows[0]?.count).toBe(1);
  });

  it("giải phóng email để đăng ký lại, và không xóa được hai lần", async () => {
    const userId = await createUser();
    const before = await db.query("SELECT email FROM users WHERE id = $1", [
      userId,
    ]);
    const oldEmail = before.rows[0]?.email as string;

    await deleteOwnAccount(db, { userId, forfeitBalance: false });

    // Chỉ mục users_email_unique_lower đã được nhả ra.
    await expect(
      db.query(
        `
          INSERT INTO users (email, full_name, password_hash, status, referral_code)
          VALUES ($1, 'Người mới', 'argon2-hash', 'ACTIVE', 'REF99999')
        `,
        [oldEmail],
      ),
    ).resolves.toBeDefined();

    await expect(
      deleteOwnAccount(db, { userId, forfeitBalance: false }),
    ).rejects.toThrow(/đã được xóa/i);
  });
});
