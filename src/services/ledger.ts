import { randomUUID } from "node:crypto";
import {
  query,
  type Database,
  type Transaction,
  withTransaction,
} from "../db.js";
import { AppError } from "../lib/errors.js";

export type WalletKind = "PENDING" | "AVAILABLE" | "HELD" | "PAID";

export interface WalletBalances {
  pending: number;
  available: number;
  held: number;
  paid: number;
}

interface LedgerAccountRow {
  id: string;
  code: string;
}

interface LedgerEntryInput {
  accountId: string;
  direction: "DEBIT" | "CREDIT";
  amountVnd: number;
}

export function assertBalanced(entries: readonly LedgerEntryInput[]): void {
  const debit = entries
    .filter((entry) => entry.direction === "DEBIT")
    .reduce((sum, entry) => sum + entry.amountVnd, 0);
  const credit = entries
    .filter((entry) => entry.direction === "CREDIT")
    .reduce((sum, entry) => sum + entry.amountVnd, 0);
  if (
    entries.length < 2 ||
    entries.some((entry) => !Number.isSafeInteger(entry.amountVnd) || entry.amountVnd <= 0) ||
    debit !== credit
  ) {
    throw new AppError(
      "UNBALANCED_LEDGER",
      "Bút toán không cân bằng hoặc có số tiền không hợp lệ.",
      500,
    );
  }
}

export async function postLedgerTransaction(
  client: Transaction,
  params: {
    type: string;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    description: string;
    entries: readonly LedgerEntryInput[];
    createdBy?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertBalanced(params.entries);
  const transactionId = randomUUID();
  const inserted = await query<{ id: string }>(
    client,
    `
      INSERT INTO ledger_transactions (
        id, type, reference_type, reference_id, idempotency_key,
        description, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
    `,
    [
      transactionId,
      params.type,
      params.referenceType,
      params.referenceId,
      params.idempotencyKey,
      params.description,
      JSON.stringify(params.metadata ?? {}),
      params.createdBy ?? null,
    ],
  );

  if (!inserted.rowCount) {
    const existing = await query<{ id: string }>(
      client,
      "SELECT id FROM ledger_transactions WHERE idempotency_key = $1",
      [params.idempotencyKey],
    );
    return existing.rows[0]!.id;
  }

  for (const entry of params.entries) {
    await query(
      client,
      `
        INSERT INTO ledger_entries (
          transaction_id, account_id, direction, amount_vnd
        ) VALUES ($1, $2, $3, $4)
      `,
      [transactionId, entry.accountId, entry.direction, entry.amountVnd],
    );
  }
  return transactionId;
}

async function getAccountIds(
  client: Transaction,
  userId: string,
  userKinds: readonly WalletKind[],
  systemCodes: readonly string[],
): Promise<Map<string, string>> {
  const accounts = await query<LedgerAccountRow>(
    client,
    `
      SELECT id, code
      FROM ledger_accounts
      WHERE (owner_type = 'USER' AND owner_id = $1 AND code = ANY($2::text[]))
         OR (owner_type = 'SYSTEM' AND owner_id IS NULL AND code = ANY($3::text[]))
      FOR UPDATE
    `,
    [userId, userKinds, systemCodes],
  );
  return new Map(accounts.rows.map((row) => [row.code, row.id]));
}

export async function getWalletBalances(
  db: Database | Transaction,
  userId: string,
): Promise<WalletBalances> {
  const result = await query<{ code: WalletKind; balance: string }>(
    db,
    `
      SELECT a.code,
        COALESCE(sum(
          CASE WHEN e.direction = 'CREDIT' THEN e.amount_vnd ELSE -e.amount_vnd END
        ), 0)::text AS balance
      FROM ledger_accounts a
      LEFT JOIN ledger_entries e ON e.account_id = a.id
      WHERE a.owner_type = 'USER'
        AND a.owner_id = $1
      GROUP BY a.code
    `,
    [userId],
  );
  const values = new Map(
    result.rows.map((row) => [row.code, Number(row.balance)]),
  );
  return {
    pending: values.get("PENDING") ?? 0,
    available: values.get("AVAILABLE") ?? 0,
    held: values.get("HELD") ?? 0,
    paid: values.get("PAID") ?? 0,
  };
}

export async function creditPendingCashback(
  db: Database,
  params: {
    userId: string;
    orderId: string;
    amountVnd: number;
    createdBy?: string;
  },
): Promise<void> {
  await withTransaction(db, async (client) => {
    const accounts = await getAccountIds(
      client,
      params.userId,
      ["PENDING"],
      ["CASHBACK_CLEARING"],
    );
    await postLedgerTransaction(client, {
      type: "CASHBACK_PENDING",
      referenceType: "ORDER",
      referenceId: params.orderId,
      idempotencyKey: `cashback:pending:${params.orderId}`,
      description: "Ghi nhận hoàn tiền đang chờ đối tác duyệt",
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries: [
        {
          accountId: accounts.get("CASHBACK_CLEARING")!,
          direction: "DEBIT",
          amountVnd: params.amountVnd,
        },
        {
          accountId: accounts.get("PENDING")!,
          direction: "CREDIT",
          amountVnd: params.amountVnd,
        },
      ],
    });
  });
}

export async function movePendingToAvailable(
  db: Database,
  params: { userId: string; orderId: string; amountVnd: number; createdBy?: string },
): Promise<void> {
  await withTransaction(db, async (client) => {
    const accounts = await getAccountIds(
      client,
      params.userId,
      ["PENDING", "AVAILABLE"],
      [],
    );
    await postLedgerTransaction(client, {
      type: "CASHBACK_APPROVED",
      referenceType: "ORDER",
      referenceId: params.orderId,
      idempotencyKey: `cashback:approved:${params.orderId}`,
      description: "Chuyển hoàn tiền đã duyệt sang số dư khả dụng",
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries: [
        {
          accountId: accounts.get("PENDING")!,
          direction: "DEBIT",
          amountVnd: params.amountVnd,
        },
        {
          accountId: accounts.get("AVAILABLE")!,
          direction: "CREDIT",
          amountVnd: params.amountVnd,
        },
      ],
    });
  });
}

export async function reverseCashback(
  db: Database,
  params: {
    userId: string;
    orderId: string;
    amountVnd: number;
    source: "PENDING" | "AVAILABLE";
    createdBy?: string;
  },
): Promise<void> {
  await withTransaction(db, async (client) => {
    const accounts = await getAccountIds(
      client,
      params.userId,
      [params.source],
      ["CASHBACK_CLEARING"],
    );
    await postLedgerTransaction(client, {
      type: "CASHBACK_REVERSED",
      referenceType: "ORDER",
      referenceId: params.orderId,
      idempotencyKey: `cashback:reversed:${params.orderId}`,
      description: "Đảo khoản hoàn do đơn hủy hoặc không hợp lệ",
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries: [
        {
          accountId: accounts.get(params.source)!,
          direction: "DEBIT",
          amountVnd: params.amountVnd,
        },
        {
          accountId: accounts.get("CASHBACK_CLEARING")!,
          direction: "CREDIT",
          amountVnd: params.amountVnd,
        },
      ],
    });
  });
}

export interface CommissionAllocation {
  buyerUserId: string;
  buyerVnd: number;
  sharerUserId?: string;
  sharerVnd: number;
  platformVnd: number;
}

/**
 * Ghi nhận hoa hồng đơn hàng đã chia 3 phần (người mua / chủ link chia sẻ /
 * nền tảng) vào một bút toán cân bằng duy nhất: tổng ghi nợ CASHBACK_CLEARING
 * luôn bằng tổng ghi có của các bên nhận — không trả tiền theo click, chỉ
 * gọi khi có đơn hợp lệ với hoa hồng > 0.
 */
export async function creditSplitCashback(
  db: Database,
  params: { orderId: string; allocation: CommissionAllocation; createdBy?: string },
): Promise<void> {
  const { allocation } = params;
  const total =
    allocation.buyerVnd + allocation.sharerVnd + allocation.platformVnd;
  if (total <= 0) return;

  await withTransaction(db, async (client) => {
    const buyerAccounts = await getAccountIds(
      client,
      allocation.buyerUserId,
      ["PENDING"],
      ["CASHBACK_CLEARING", "PLATFORM_REVENUE"],
    );
    const sharerAccounts =
      allocation.sharerUserId && allocation.sharerVnd > 0
        ? await getAccountIds(client, allocation.sharerUserId, ["PENDING"], [])
        : undefined;

    const entries: {
      accountId: string;
      direction: "DEBIT" | "CREDIT";
      amountVnd: number;
    }[] = [
      { accountId: buyerAccounts.get("CASHBACK_CLEARING")!, direction: "DEBIT", amountVnd: total },
    ];
    if (allocation.buyerVnd > 0) {
      entries.push({
        accountId: buyerAccounts.get("PENDING")!,
        direction: "CREDIT",
        amountVnd: allocation.buyerVnd,
      });
    }
    if (allocation.sharerVnd > 0 && sharerAccounts) {
      entries.push({
        accountId: sharerAccounts.get("PENDING")!,
        direction: "CREDIT",
        amountVnd: allocation.sharerVnd,
      });
    }
    if (allocation.platformVnd > 0) {
      entries.push({
        accountId: buyerAccounts.get("PLATFORM_REVENUE")!,
        direction: "CREDIT",
        amountVnd: allocation.platformVnd,
      });
    }

    await postLedgerTransaction(client, {
      type: "CASHBACK_PENDING",
      referenceType: "ORDER",
      referenceId: params.orderId,
      idempotencyKey: `cashback:pending:${params.orderId}`,
      description: "Ghi nhận hoa hồng đơn hàng đang chờ đối tác duyệt",
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries,
    });
  });
}

export async function moveSplitPendingToAvailable(
  db: Database,
  params: { orderId: string; allocation: CommissionAllocation; createdBy?: string },
): Promise<void> {
  const { allocation } = params;
  await withTransaction(db, async (client) => {
    const buyerAccounts =
      allocation.buyerVnd > 0
        ? await getAccountIds(client, allocation.buyerUserId, ["PENDING", "AVAILABLE"], [])
        : undefined;
    const sharerAccounts =
      allocation.sharerUserId && allocation.sharerVnd > 0
        ? await getAccountIds(client, allocation.sharerUserId, ["PENDING", "AVAILABLE"], [])
        : undefined;

    const entries: {
      accountId: string;
      direction: "DEBIT" | "CREDIT";
      amountVnd: number;
    }[] = [];
    if (allocation.buyerVnd > 0 && buyerAccounts) {
      entries.push(
        { accountId: buyerAccounts.get("PENDING")!, direction: "DEBIT", amountVnd: allocation.buyerVnd },
        { accountId: buyerAccounts.get("AVAILABLE")!, direction: "CREDIT", amountVnd: allocation.buyerVnd },
      );
    }
    if (allocation.sharerVnd > 0 && sharerAccounts) {
      entries.push(
        { accountId: sharerAccounts.get("PENDING")!, direction: "DEBIT", amountVnd: allocation.sharerVnd },
        { accountId: sharerAccounts.get("AVAILABLE")!, direction: "CREDIT", amountVnd: allocation.sharerVnd },
      );
    }
    if (!entries.length) return;

    await postLedgerTransaction(client, {
      type: "CASHBACK_APPROVED",
      referenceType: "ORDER",
      referenceId: params.orderId,
      idempotencyKey: `cashback:approved:${params.orderId}`,
      description: "Chuyển hoa hồng đã duyệt sang số dư khả dụng",
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries,
    });
  });
}

export async function reverseSplitCashback(
  db: Database,
  params: {
    orderId: string;
    allocation: CommissionAllocation;
    source: "PENDING" | "AVAILABLE";
    createdBy?: string;
  },
): Promise<void> {
  const { allocation } = params;
  const total =
    allocation.buyerVnd + allocation.sharerVnd + allocation.platformVnd;
  if (total <= 0) return;

  await withTransaction(db, async (client) => {
    const buyerAccounts = await getAccountIds(
      client,
      allocation.buyerUserId,
      [params.source],
      ["CASHBACK_CLEARING", "PLATFORM_REVENUE"],
    );
    const sharerAccounts =
      allocation.sharerUserId && allocation.sharerVnd > 0
        ? await getAccountIds(client, allocation.sharerUserId, [params.source], [])
        : undefined;

    const entries: {
      accountId: string;
      direction: "DEBIT" | "CREDIT";
      amountVnd: number;
    }[] = [
      { accountId: buyerAccounts.get("CASHBACK_CLEARING")!, direction: "CREDIT", amountVnd: total },
    ];
    if (allocation.buyerVnd > 0) {
      entries.push({
        accountId: buyerAccounts.get(params.source)!,
        direction: "DEBIT",
        amountVnd: allocation.buyerVnd,
      });
    }
    if (allocation.sharerVnd > 0 && sharerAccounts) {
      entries.push({
        accountId: sharerAccounts.get(params.source)!,
        direction: "DEBIT",
        amountVnd: allocation.sharerVnd,
      });
    }
    if (allocation.platformVnd > 0) {
      entries.push({
        accountId: buyerAccounts.get("PLATFORM_REVENUE")!,
        direction: "DEBIT",
        amountVnd: allocation.platformVnd,
      });
    }

    await postLedgerTransaction(client, {
      type: "CASHBACK_REVERSED",
      referenceType: "ORDER",
      referenceId: params.orderId,
      idempotencyKey: `cashback:reversed:${params.orderId}`,
      description: "Đảo hoa hồng do đơn hủy hoặc không hợp lệ",
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries,
    });
  });
}

export async function creditFixedReward(
  db: Database,
  params: {
    userId: string;
    referenceId: string;
    idempotencyKey: string;
    description: string;
    amountVnd: number;
    createdBy?: string;
    type?: string;
    referenceType?: string;
  },
): Promise<void> {
  if (params.amountVnd <= 0) return;
  await withTransaction(db, async (client) => {
    const accounts = await getAccountIds(
      client,
      params.userId,
      ["AVAILABLE"],
      ["ADJUSTMENT"],
    );
    await postLedgerTransaction(client, {
      type: params.type ?? "REFERRAL_REWARD",
      referenceType: params.referenceType ?? "REFERRAL",
      referenceId: params.referenceId,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      entries: [
        {
          accountId: accounts.get("ADJUSTMENT")!,
          direction: "DEBIT",
          amountVnd: params.amountVnd,
        },
        {
          accountId: accounts.get("AVAILABLE")!,
          direction: "CREDIT",
          amountVnd: params.amountVnd,
        },
      ],
    });
  });
}

export async function createWithdrawalFromIntent(
  db: Database,
  intentId: string,
): Promise<string> {
  return withTransaction(db, async (client) => {
    const intentResult = await query<{
      id: string;
      user_id: string;
      bank_account_id: string;
      amount_vnd: string;
      status: string;
      expires_at: Date;
      bank_code: string;
      account_number_ciphertext: string;
      account_name_ciphertext: string;
      account_last4: string;
    }>(
      client,
      `
        SELECT i.*, b.bank_code, b.account_number_ciphertext,
          b.account_name_ciphertext, b.account_last4
        FROM withdrawal_intents i
        JOIN user_bank_accounts b ON b.id = i.bank_account_id
        WHERE i.id = $1 AND b.user_id = i.user_id AND b.status = 'VERIFIED'
        FOR UPDATE
      `,
      [intentId],
    );
    const intent = intentResult.rows[0];
    if (!intent || intent.status !== "OTP_PENDING" || intent.expires_at.getTime() <= Date.now()) {
      throw new AppError(
        "WITHDRAWAL_INTENT_INVALID",
        "Yêu cầu rút tiền không còn hiệu lực.",
      );
    }

    const amountVnd = Number(intent.amount_vnd);
    const accounts = await getAccountIds(
      client,
      intent.user_id,
      ["AVAILABLE", "HELD"],
      [],
    );
    const balances = await getWalletBalances(client, intent.user_id);
    if (balances.available < amountVnd) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        "Số dư khả dụng không đủ để rút.",
      );
    }

    const withdrawal = await query<{ id: string }>(
      client,
      `
        INSERT INTO withdrawals (
          user_id, amount_vnd, bank_code, bank_account_ciphertext,
          bank_name_ciphertext, bank_last4, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'FUNDS_HELD')
        RETURNING id
      `,
      [
        intent.user_id,
        amountVnd,
        intent.bank_code,
        intent.account_number_ciphertext,
        intent.account_name_ciphertext,
        intent.account_last4,
      ],
    );
    const withdrawalId = withdrawal.rows[0]!.id;

    await postLedgerTransaction(client, {
      type: "WITHDRAWAL_HOLD",
      referenceType: "WITHDRAWAL",
      referenceId: withdrawalId,
      idempotencyKey: `withdrawal:hold:${intent.id}`,
      description: "Giữ số dư cho yêu cầu rút tiền",
      entries: [
        {
          accountId: accounts.get("AVAILABLE")!,
          direction: "DEBIT",
          amountVnd,
        },
        {
          accountId: accounts.get("HELD")!,
          direction: "CREDIT",
          amountVnd,
        },
      ],
    });
    await query(
      client,
      "UPDATE withdrawal_intents SET status = 'CONFIRMED' WHERE id = $1",
      [intent.id],
    );
    return withdrawalId;
  });
}

export async function releaseWithdrawalHold(
  db: Database,
  params: {
    withdrawalId: string;
    actorId: string;
    reason: string;
  },
): Promise<void> {
  await withTransaction(db, async (client) => {
    const withdrawal = await query<{
      id: string;
      user_id: string;
      amount_vnd: string;
      status: string;
    }>(
      client,
      "SELECT id, user_id, amount_vnd, status FROM withdrawals WHERE id = $1 FOR UPDATE",
      [params.withdrawalId],
    );
    const row = withdrawal.rows[0];
    if (!row || !["FUNDS_HELD", "APPROVED"].includes(row.status)) {
      throw new AppError(
        "WITHDRAWAL_NOT_REJECTABLE",
        "Yêu cầu rút tiền không ở trạng thái có thể từ chối.",
      );
    }
    const amountVnd = Number(row.amount_vnd);
    const accounts = await getAccountIds(
      client,
      row.user_id,
      ["AVAILABLE", "HELD"],
      [],
    );
    await postLedgerTransaction(client, {
      type: "WITHDRAWAL_RELEASE",
      referenceType: "WITHDRAWAL",
      referenceId: row.id,
      idempotencyKey: `withdrawal:release:${row.id}`,
      description: "Hoàn lại số dư do yêu cầu rút bị từ chối",
      createdBy: params.actorId,
      metadata: { reason: params.reason },
      entries: [
        {
          accountId: accounts.get("HELD")!,
          direction: "DEBIT",
          amountVnd,
        },
        {
          accountId: accounts.get("AVAILABLE")!,
          direction: "CREDIT",
          amountVnd,
        },
      ],
    });
    await query(
      client,
      `
        UPDATE withdrawals
        SET status = 'REJECTED', rejection_reason = $2,
          decided_by = $3, decided_at = now()
        WHERE id = $1
      `,
      [row.id, params.reason, params.actorId],
    );
  });
}
