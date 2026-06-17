/**
 * Seed Firestore from scripts/seed-data.json
 *
 * Usage:
 *   npm run seed
 *
 * Requires in .env:
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing Firebase Admin credentials in .env:\n" +
      "  FIREBASE_ADMIN_PROJECT_ID\n" +
      "  FIREBASE_ADMIN_CLIENT_EMAIL\n" +
      "  FIREBASE_ADMIN_PRIVATE_KEY"
  );
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();
const seedPath = resolve(__dirname, "seed-data.json");
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

async function seedCollection(collectionName, documents) {
  if (!documents || typeof documents !== "object") return 0;

  let count = 0;
  for (const [docId, data] of Object.entries(documents)) {
    await db
      .collection(collectionName)
      .doc(docId)
      .set({ ...data, seededAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log(`  ✓ ${collectionName}/${docId}`);
    count++;
  }
  return count;
}

async function main() {
  console.log("Seeding Firestore from seed-data.json…\n");

  let total = 0;
  for (const [collection, documents] of Object.entries(seed)) {
    console.log(`→ ${collection}`);
    total += await seedCollection(collection, documents);
    console.log("");
  }

  console.log(`Done! ${total} documents written.`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
