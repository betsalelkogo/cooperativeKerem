/**
 * Reset Firestore transactional data and mark all tools available.
 *
 * Deletes: reservations, loans, transactions, payments, paybox_payouts, maintenance_tickets, late_return_fees
 * Resets:  all tools → status "available"
 * Resets:  device_pots + operations_pot balances to 0
 * Keeps:   tools (definitions), members, settings
 *
 * With --reseed: overwrites gemachim, tools, device_pots, operations_pot, settings from seed-data.json
 *
 * Usage:
 *   npm run migrate:reset
 *   npm run migrate:reset -- --reseed
 *   npm run migrate:reset -- --dry-run
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const COLLECTIONS_TO_DELETE = [
  "reservations",
  "loans",
  "transactions",
  "payments",
  "paybox_payouts",
  "maintenance_tickets",
  "late_return_fees",
];

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

const dryRun = process.argv.includes("--dry-run");
const reseed = process.argv.includes("--reseed");

const keyArg = process.argv.find((a) => a.startsWith("--key="));
let projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
let clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (keyArg) {
  const keyPath = resolve(keyArg.slice("--key=".length));
  if (!existsSync(keyPath)) {
    console.error(`Service account file not found: ${keyPath}`);
    process.exit(1);
  }
  const json = JSON.parse(readFileSync(keyPath, "utf8"));
  projectId = json.project_id;
  clientEmail = json.client_email;
  privateKey = json.private_key;
  console.log(`Using service account: ${clientEmail}\n`);
}

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing Firebase Admin credentials.\n\n" +
      "Option A — set in .env:\n" +
      "  FIREBASE_ADMIN_PROJECT_ID\n" +
      "  FIREBASE_ADMIN_CLIENT_EMAIL\n" +
      "  FIREBASE_ADMIN_PRIVATE_KEY\n\n" +
      "Option B — pass downloaded JSON:\n" +
      "  npm run migrate:reset -- --key=./path/to/service-account.json"
  );
  process.exit(1);
}

if (clientEmail.includes("...@....") || privateKey.includes("...")) {
  console.error(
    "Firebase Admin credentials look like placeholders, not real values.\n" +
      "Download a service account JSON from Firebase Console → Service accounts."
  );
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const db = getFirestore();

async function deleteCollection(collectionName) {
  const snap = await db.collection(collectionName).get();
  if (snap.empty) {
    console.log(`  · ${collectionName}: empty`);
    return 0;
  }

  if (dryRun) {
    console.log(`  · ${collectionName}: would delete ${snap.size} documents`);
    return snap.size;
  }

  const batchSize = 400;
  let deleted = 0;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + batchSize)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += Math.min(batchSize, docs.length - i);
  }

  console.log(`  ✓ ${collectionName}: deleted ${deleted} documents`);
  return deleted;
}

async function resetTools() {
  const snap = await db.collection("tools").get();
  if (snap.empty) {
    console.log("  · tools: no documents found");
    return 0;
  }

  if (dryRun) {
    console.log(`  · tools: would set ${snap.size} tools to available`);
    return snap.size;
  }

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { status: "available" });
  }
  await batch.commit();
  console.log(`  ✓ tools: set ${snap.size} tools to available`);
  return snap.size;
}

async function resetPots() {
  let count = 0;

  const deviceSnap = await db.collection("device_pots").get();
  if (!deviceSnap.empty) {
    if (dryRun) {
      console.log(`  · device_pots: would reset ${deviceSnap.size} pots`);
      count += deviceSnap.size;
    } else {
      const batch = db.batch();
      for (const doc of deviceSnap.docs) {
        batch.update(doc.ref, { balance: 0, totalEarned: 0, totalSpent: 0 });
      }
      await batch.commit();
      console.log(`  ✓ device_pots: reset ${deviceSnap.size} pots`);
      count += deviceSnap.size;
    }
  }

  const opsSnap = await db.collection("operations_pot").get();
  if (!opsSnap.empty) {
    if (dryRun) {
      console.log(`  · operations_pot: would reset ${opsSnap.size} pots`);
      count += opsSnap.size;
    } else {
      const batch = db.batch();
      for (const doc of opsSnap.docs) {
        batch.update(doc.ref, { balance: 0, totalEarned: 0, totalSpent: 0 });
      }
      await batch.commit();
      console.log(`  ✓ operations_pot: reset ${opsSnap.size} pots`);
      count += opsSnap.size;
    }
  }

  if (count === 0) {
    console.log("  · pots: none found");
  }

  return count;
}

async function reseedFromFile() {
  const seedPath = resolve(__dirname, "seed-data.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));

  console.log("\n→ Reseeding from seed-data.json");
  let count = 0;

  for (const [collectionName, documents] of Object.entries(seed)) {
    if (!documents || typeof documents !== "object") continue;

    for (const [docId, data] of Object.entries(documents)) {
      if (dryRun) {
        console.log(`  · ${collectionName}/${docId}: would overwrite`);
        count++;
        continue;
      }
      await db
        .collection(collectionName)
        .doc(docId)
        .set({ ...data, seededAt: FieldValue.serverTimestamp() });
      console.log(`  ✓ ${collectionName}/${docId}`);
      count++;
    }
  }

  return count;
}

async function main() {
  console.log(
    dryRun
      ? "Dry run — no writes.\n"
      : reseed
        ? "Full reset + reseed from seed-data.json…\n"
        : "Resetting Firestore…\n"
  );
  console.log(`Project: ${projectId}\n`);

  let total = 0;

  console.log("→ Deleting transactional collections");
  for (const name of COLLECTIONS_TO_DELETE) {
    total += await deleteCollection(name);
  }

  console.log("\n→ Resetting tools");
  if (reseed) {
    console.log("  · skipped (tools will be overwritten from seed-data.json)");
  } else {
    total += await resetTools();
  }

  console.log("\n→ Resetting pots");
  if (reseed) {
    console.log("  · skipped (pots will be overwritten from seed-data.json)");
  } else {
    total += await resetPots();
  }

  if (reseed) {
    total += await reseedFromFile();
  }

  console.log(
    dryRun
      ? `\nDry run complete. ${total} operations would run.`
      : reseed
        ? `\nDone! Database reset and reseeded from seed-data.json.`
        : `\nDone! Database reset — all tools available, transactional data cleared.`
  );
  console.log(
    reseed
      ? "Kept: members (user accounts). All seed collections overwritten."
      : "Kept: tools (definitions), members, settings"
  );
}

main().catch((err) => {
  const msg = err.message ?? String(err);
  if (msg.includes("UNAUTHENTICATED") || msg.includes("invalid authentication")) {
    console.error(
      "Reset failed: invalid Firebase Admin credentials (UNAUTHENTICATED).\n\n" +
        "Check:\n" +
        "  • FIREBASE_ADMIN_CLIENT_EMAIL has no typos (must start with firebase-adminsdk-)\n" +
        "  • FIREBASE_ADMIN_PRIVATE_KEY is the full key, wrapped in quotes in .env\n" +
        "  • Or use: npm run migrate:reset -- --key=./service-account.json"
    );
  } else {
    console.error("Reset failed:", msg);
  }
  process.exit(1);
});
