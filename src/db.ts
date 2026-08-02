import pg, {
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";
import type { AppConfig } from "./config.js";

const { Pool } = pg;

export type Database = pg.Pool;
export type Transaction = PoolClient;

export function createDatabase(config: AppConfig): Database {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    application_name: "aff-hoan-tien",
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export async function query<T extends QueryResultRow>(
  db: Database | Transaction,
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return db.query<T>(text, [...values]);
}

export async function withTransaction<T>(
  db: Database,
  fn: (client: Transaction) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function assertDatabaseReady(db: Database): Promise<void> {
  await db.query("SELECT 1");
}
