import type { AppConfig } from "../config.js";
import { query, type Database } from "../db.js";
import { AppError } from "../lib/errors.js";
import type { EmailService } from "./email.js";
import { getBusinessConfig } from "./business-config.js";
import { getWalletBalances } from "./ledger.js";
import { issueOtp, verifyOtp } from "./otp.js";

export async function requestWithdrawal(
  db: Database,
  emailService: EmailService,
  config: AppConfig,
  params: {
    userId: string;
    email: string;
    bankAccountId: string;
    amountVnd: number;
  },
): Promise<string> {
  const businessConfig = await getBusinessConfig(db, config);
  if (
    !Number.isSafeInteger(params.amountVnd) ||
    params.amountVnd < businessConfig.minWithdrawAmountVnd ||
    params.amountVnd > config.MAX_WITHDRAWAL_VND
  ) {
    throw new AppError(
      "INVALID_WITHDRAWAL_AMOUNT",
      `Số tiền rút cần từ ${businessConfig.minWithdrawAmountVnd.toLocaleString("vi-VN")} đến ${config.MAX_WITHDRAWAL_VND.toLocaleString("vi-VN")} đồng.`,
    );
  }
  const bank = await query<{ id: string }>(
    db,
    `
      SELECT id FROM user_bank_accounts
      WHERE id = $1 AND user_id = $2 AND status = 'VERIFIED'
    `,
    [params.bankAccountId, params.userId],
  );
  if (!bank.rowCount) {
    throw new AppError(
      "BANK_NOT_VERIFIED",
      "Hãy chọn tài khoản ngân hàng đã được xác minh.",
    );
  }
  const balances = await getWalletBalances(db, params.userId);
  if (balances.available < params.amountVnd) {
    throw new AppError(
      "INSUFFICIENT_BALANCE",
      "Số dư khả dụng không đủ để rút.",
    );
  }

  const intent = await query<{ id: string }>(
    db,
    `
      INSERT INTO withdrawal_intents (
        user_id, bank_account_id, amount_vnd, expires_at
      ) VALUES ($1, $2, $3, now() + interval '15 minutes')
      RETURNING id
    `,
    [params.userId, params.bankAccountId, params.amountVnd],
  );
  const intentId = intent.rows[0]!.id;
  try {
    await issueOtp(
      db,
      emailService,
      config,
      params.email,
      `WITHDRAWAL:${intentId}`,
    );
  } catch (error) {
    await query(
      db,
      "UPDATE withdrawal_intents SET status = 'CANCELLED' WHERE id = $1",
      [intentId],
    );
    throw error;
  }
  return intentId;
}

export async function verifyWithdrawalOtp(
  db: Database,
  config: AppConfig,
  params: { intentId: string; userId: string; email: string; code: string },
): Promise<void> {
  const owned = await query(
    db,
    `
      SELECT 1 FROM withdrawal_intents
      WHERE id = $1 AND user_id = $2 AND status = 'OTP_PENDING'
    `,
    [params.intentId, params.userId],
  );
  if (!owned.rowCount) {
    throw new AppError(
      "WITHDRAWAL_INTENT_INVALID",
      "Yêu cầu rút tiền không còn hiệu lực.",
    );
  }
  await verifyOtp(
    db,
    config,
    params.email,
    `WITHDRAWAL:${params.intentId}`,
    params.code,
  );
}
