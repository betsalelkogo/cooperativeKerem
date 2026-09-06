import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { Client } from "pg";

function databaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

export function isNeonConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let sql: NeonQueryFunction<false, false> | null = null;

/** One-shot SQL (HTTP). Prefer this for simple reads/writes. */
export function getSql(): NeonQueryFunction<false, false> {
  if (!sql) {
    sql = neon(databaseUrl());
  }
  return sql;
}

export type TxClient = {
  query: (
    queryText: string,
    values?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

/**
 * Interactive transaction over a fresh TCP connection.
 * Neon WebSocket pools fail on Vercel/serverless ("not queryable").
 */
export async function withTransaction<T>(
  fn: (client: TxClient) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString: databaseUrl(),
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
  } catch {
    throw new Error("לא ניתן להתחבר למסד הנתונים");
  }

  try {
    await client.query("BEGIN");
    const result = await fn(client as unknown as TxClient);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // connection already dead — Postgres aborts the open transaction
    }
    throw err;
  } finally {
    await client.end().catch(() => undefined);
  }
}
