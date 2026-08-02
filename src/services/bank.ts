import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import {
  encryptField,
  lastFour,
  maskAccountName,
} from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import type { EmailService } from "./email.js";
import { issueOtp, verifyOtp } from "./otp.js";

export const BANKS = [
  { code: "VCB", name: "Vietcombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "MB", name: "MB Bank" },
  { code: "ACB", name: "ACB" },
  { code: "VPB", name: "VPBank" },
  { code: "BIDV", name: "BIDV" },
  { code: "VTB", name: "VietinBank" },
  { code: "TPB", name: "TPBank" },
  { code: "STB", name: "Sacombank" },
] as const;

export function validateBankInput(params: {
  bankCode: string;
  accountNumber: string;
  accountName: string;
}): void {
  if (!BANKS.some((bank) => bank.code === params.bankCode)) {
    throw new AppError("BANK_NOT_SUPPORTED", "Ngân hàng chưa được hỗ trợ.");
  }
  if (!/^\d{6,20}$/.test(params.accountNumber)) {
    throw new AppError(
      "INVALID_BANK_ACCOUNT",
      "Số tài khoản cần từ 6 đến 20 chữ số.",
    );
  }
  if (
    params.accountName.trim().length < 3 ||
    params.accountName.trim().length > 100
  ) {
    throw new AppError(
      "INVALID_ACCOUNT_NAME",
      "Tên chủ tài khoản chưa hợp lệ.",
    );
  }
}

export async function requestBankChange(
  db: Database,
  emailService: EmailService,
  config: AppConfig,
  params: {
    userId: string;
    email: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
  },
): Promise<string> {
  validateBankInput(params);
  const result = await query<{ id: string }>(
    db,
    `
      INSERT INTO bank_change_requests (
        user_id, bank_code, account_number_ciphertext,
        account_name_ciphertext, account_last4, account_name_masked,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '15 minutes')
      RETURNING id
    `,
    [
      params.userId,
      params.bankCode,
      encryptField(params.accountNumber, config),
      encryptField(params.accountName.trim().toUpperCase(), config),
      lastFour(params.accountNumber),
      maskAccountName(params.accountName.trim().toUpperCase()),
    ],
  );
  const requestId = result.rows[0]!.id;
  try {
    await issueOtp(
      db,
      emailService,
      config,
      params.email,
      `BANK_CHANGE:${requestId}`,
    );
  } catch (error) {
    await query(
      db,
      "UPDATE bank_change_requests SET status = 'CANCELLED' WHERE id = $1",
      [requestId],
    );
    throw error;
  }
  return requestId;
}

export async function confirmBankChange(
  db: Database,
  config: AppConfig,
  params: {
    requestId: string;
    userId: string;
    email: string;
    code: string;
  },
): Promise<string> {
  await verifyOtp(
    db,
    config,
    params.email,
    `BANK_CHANGE:${params.requestId}`,
    params.code,
  );
  const result = await query<{
    id: string;
    bank_code: string;
    account_number_ciphertext: string;
    account_name_ciphertext: string;
    account_last4: string;
    account_name_masked: string;
  }>(
    db,
    `
      UPDATE bank_change_requests
      SET status = 'CONFIRMED'
      WHERE id = $1
        AND user_id = $2
        AND status = 'OTP_PENDING'
        AND expires_at > now()
      RETURNING id, bank_code, account_number_ciphertext,
        account_name_ciphertext, account_last4, account_name_masked
    `,
    [params.requestId, params.userId],
  );
  const change = result.rows[0];
  if (!change) {
    throw new AppError(
      "BANK_CHANGE_EXPIRED",
      "Yêu cầu thêm ngân hàng đã hết hạn.",
    );
  }
  // OTP đúng là kích hoạt luôn (VERIFIED) — không chờ vận hành duyệt tay.
  const bank = await query<{ id: string }>(
    db,
    `
      INSERT INTO user_bank_accounts (
        user_id, bank_code, account_number_ciphertext,
        account_name_ciphertext, account_last4, account_name_masked,
        status, verified_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'VERIFIED', now())
      RETURNING id
    `,
    [
      params.userId,
      change.bank_code,
      change.account_number_ciphertext,
      change.account_name_ciphertext,
      change.account_last4,
      change.account_name_masked,
    ],
  );
  return bank.rows[0]!.id;
}
