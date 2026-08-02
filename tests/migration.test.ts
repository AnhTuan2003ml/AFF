import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

describe("PostgreSQL migration", () => {
  it("tạo đủ schema, ví người dùng và chặn bút toán lệch", async () => {
    const db = new PGlite();
    try {
      const sql = await readFile(
        path.join(process.cwd(), "migrations", "001_initial.sql"),
        "utf8",
      );
      await db.exec(sql);

      const tables = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
      );
      expect(tables.rows[0]?.count).toBeGreaterThanOrEqual(26);

      const user = await db.query<{ id: string }>(
        `
          INSERT INTO users (
            email, full_name, status, role, referral_code
          ) VALUES (
            'test@example.com', 'Test User', 'ACTIVE', 'USER', 'TESTREF'
          ) RETURNING id
        `,
      );
      const userId = user.rows[0]!.id;
      const walletAccounts = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM ledger_accounts
          WHERE owner_type = 'USER' AND owner_id = $1
        `,
        [userId],
      );
      expect(walletAccounts.rows[0]?.count).toBe(4);

      const available = await db.query<{ id: string }>(
        "SELECT id FROM ledger_accounts WHERE owner_type = 'USER' AND owner_id = $1 AND code = 'AVAILABLE'",
        [userId],
      );
      const clearing = await db.query<{ id: string }>(
        "SELECT id FROM ledger_accounts WHERE owner_type = 'SYSTEM' AND code = 'CASHBACK_CLEARING'",
      );

      await db.exec("BEGIN");
      const transaction = await db.query<{ id: string }>(
        `
          INSERT INTO ledger_transactions (
            type, reference_type, reference_id, idempotency_key, description
          ) VALUES (
            'TEST', 'TEST', '1', 'test:balanced:1', 'Balanced test'
          ) RETURNING id
        `,
      );
      await db.query(
        `
          INSERT INTO ledger_entries (
            transaction_id, account_id, direction, amount_vnd
          ) VALUES ($1, $2, 'DEBIT', 1000), ($1, $3, 'CREDIT', 1000)
        `,
        [
          transaction.rows[0]!.id,
          clearing.rows[0]!.id,
          available.rows[0]!.id,
        ],
      );
      await db.exec("COMMIT");

      await db.exec("BEGIN");
      const unbalanced = await db.query<{ id: string }>(
        `
          INSERT INTO ledger_transactions (
            type, reference_type, reference_id, idempotency_key, description
          ) VALUES (
            'TEST', 'TEST', '2', 'test:unbalanced:1', 'Unbalanced test'
          ) RETURNING id
        `,
      );
      await db.query(
        `
          INSERT INTO ledger_entries (
            transaction_id, account_id, direction, amount_vnd
          ) VALUES ($1, $2, 'CREDIT', 500)
        `,
        [unbalanced.rows[0]!.id, available.rows[0]!.id],
      );
      await expect(db.exec("COMMIT")).rejects.toThrow(/Unbalanced ledger/i);
      await db.exec("ROLLBACK");
    } finally {
      await db.close();
    }
  });
});
