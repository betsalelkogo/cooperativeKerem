import { neon, neonConfig, Pool, type NeonQueryFunction } from "@neondatabase/serverless";
import { WebSocket } from "ws";

neonConfig.webSocketConstructor = WebSocket;

let sql: NeonQueryFunction<false, false> | null = null;
let pool: Pool | null = null;

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

/** One-shot SQL (HTTP). Prefer this for simple reads/writes. */
export function getSql(): NeonQueryFunction<false, false> {
  if (!sql) {
    sql = neon(databaseUrl());
  }
  return sql;
}

/** Pooled WebSocket client — use for multi-statement transactions. */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl() });
  }
  return pool;
}

export async function withTransaction<T>(
  fn: (client: { query: Pool["query"] }) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
