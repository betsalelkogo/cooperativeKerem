/**
 * Apply scripts/sql/*.sql to Neon (001, 002, …).
 *
 *   npm run db:schema
 *
 * Requires DATABASE_URL in .env (Neon pooled connection string).
 * Do not print the connection string.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(root, ".env"));
loadEnvFile(resolve(root, ".env.local"));

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env");
  process.exit(1);
}

function splitSql(sqlFile) {
  return sqlFile
    .split(/;\s*\n/)
    .map((s) =>
      s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

const sql = neon(databaseUrl);

async function main() {
  const dir = resolve(__dirname, "sql");
  const files = readdirSync(dir)
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    const statements = splitSql(readFileSync(resolve(dir, file), "utf8"));
    console.log(`Applying ${file} (${statements.length} statements)…`);
    for (const statement of statements) {
      await sql.query(statement);
    }
  }
  console.log("Neon schema is ready.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
