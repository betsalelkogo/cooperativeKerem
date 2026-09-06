/**
 * Copy all Firestore collections into Neon.
 * Re-runnable (ON CONFLICT UPDATE). Does not delete extra Neon rows.
 *
 *   npm run db:import
 *
 * Requires Firebase Admin env vars + DATABASE_URL.
 * Never logs secrets or connection strings.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing Firebase Admin credentials in .env");
  process.exit(1);
}
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const firestore = getFirestore();
const sql = neon(databaseUrl);

function toIso(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value._seconds === "number") {
    return new Date(value._seconds * 1000).toISOString();
  }
  return null;
}

function num(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function str(value, fallback = null) {
  return typeof value === "string" && value ? value : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function textArray(value) {
  if (!Array.isArray(value)) return null;
  return value.filter((v) => typeof v === "string");
}

function json(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  return JSON.stringify(value);
}

async function loadCollection(name) {
  const snap = await firestore.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function importGemachim() {
  const rows = await loadCollection("gemachim");
  if (rows.length === 0) {
    await sql.query(
      `INSERT INTO gemachim (id, name, slug, pricing_mode, is_platform, active, reservation_mode)
       VALUES ('kerem', $1, 'kerem', 'loan_fee', TRUE, TRUE, 'fixed_hours')
       ON CONFLICT (id) DO NOTHING`,
      ["כרם רעים"]
    );
    console.log("  gemachim: inserted default kerem");
    return;
  }
  for (const row of rows) {
    await sql.query(
      `INSERT INTO gemachim (
         id, name, slug, description, pricing_mode, maintenance_fee, paybox_group_url,
         is_platform, active, reservation_mode, default_loan_hours, max_loan_hours,
         closed_at, cooperative_fee, location
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         description = EXCLUDED.description,
         pricing_mode = EXCLUDED.pricing_mode,
         maintenance_fee = EXCLUDED.maintenance_fee,
         paybox_group_url = EXCLUDED.paybox_group_url,
         is_platform = EXCLUDED.is_platform,
         active = EXCLUDED.active,
         reservation_mode = EXCLUDED.reservation_mode,
         default_loan_hours = EXCLUDED.default_loan_hours,
         max_loan_hours = EXCLUDED.max_loan_hours,
         closed_at = EXCLUDED.closed_at,
         cooperative_fee = EXCLUDED.cooperative_fee,
         location = EXCLUDED.location,
         updated_at = NOW()`,
      [
        row.id,
        str(row.name, row.id),
        str(row.slug, row.id),
        str(row.description),
        str(row.pricingMode, "loan_fee"),
        num(row.maintenanceFee),
        str(row.payboxGroupUrl),
        bool(row.isPlatform),
        row.active !== false,
        str(row.reservationMode),
        num(row.defaultLoanHours),
        num(row.maxLoanHours),
        toIso(row.closedAt),
        num(row.cooperativeFee),
        str(row.location),
      ]
    );
  }
  console.log(`  gemachim: ${rows.length}`);
}

async function importMembers() {
  const rows = await loadCollection("members");
  for (const row of rows) {
    const adminIds = Array.isArray(row.gemachAdminIds)
      ? row.gemachAdminIds.filter((id) => typeof id === "string")
      : [];
    await sql.query(
      `INSERT INTO members (
         id, name, first_name, family_name, name_completed, email, phone,
         is_a_member, first_payout, terms_accepted_at, membership_offer_dismissed_at,
         has_payment_method, role, gemach_admin_ids, credit_balance, photo_url
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         first_name = EXCLUDED.first_name,
         family_name = EXCLUDED.family_name,
         name_completed = EXCLUDED.name_completed,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         is_a_member = EXCLUDED.is_a_member,
         first_payout = EXCLUDED.first_payout,
         terms_accepted_at = EXCLUDED.terms_accepted_at,
         membership_offer_dismissed_at = EXCLUDED.membership_offer_dismissed_at,
         has_payment_method = EXCLUDED.has_payment_method,
         role = EXCLUDED.role,
         gemach_admin_ids = EXCLUDED.gemach_admin_ids,
         credit_balance = EXCLUDED.credit_balance,
         photo_url = EXCLUDED.photo_url,
         updated_at = NOW()`,
      [
        row.id,
        str(row.name, "חבר"),
        str(row.firstName),
        str(row.familyName),
        bool(row.nameCompleted),
        str(row.email, ""),
        str(row.phone),
        bool(row.isAmember),
        row.firstPayout !== false,
        toIso(row.termsAcceptedAt),
        toIso(row.membershipOfferDismissedAt),
        bool(row.hasPaymentMethod),
        str(row.role) || (row.isAdmin === true ? "ADMIN" : "MEMBER"),
        adminIds,
        num(row.creditBalance, 0),
        str(row.photoURL),
      ]
    );
  }
  console.log(`  members: ${rows.length}`);
}

async function importTools() {
  const rows = await loadCollection("tools");
  for (const row of rows) {
    const kindId = str(row.kindId, row.id);
    const gemachId = str(row.gemachId, "kerem");
    await sql.query(
      `INSERT INTO tools (
         id, name, description, category, qr_code, status, loan_fee_min, loan_fee_max,
         safety_rules, included_items, image_url, admin_notes, gemach_id, kind_id,
         unit_label, default_loan_hours, max_loan_hours, location, brand, supplier,
         purpose, product_age, youtube_url, image_urls
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
       )
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         qr_code = EXCLUDED.qr_code,
         status = EXCLUDED.status,
         loan_fee_min = EXCLUDED.loan_fee_min,
         loan_fee_max = EXCLUDED.loan_fee_max,
         safety_rules = EXCLUDED.safety_rules,
         included_items = EXCLUDED.included_items,
         image_url = EXCLUDED.image_url,
         admin_notes = EXCLUDED.admin_notes,
         gemach_id = EXCLUDED.gemach_id,
         kind_id = EXCLUDED.kind_id,
         unit_label = EXCLUDED.unit_label,
         default_loan_hours = EXCLUDED.default_loan_hours,
         max_loan_hours = EXCLUDED.max_loan_hours,
         location = EXCLUDED.location,
         brand = EXCLUDED.brand,
         supplier = EXCLUDED.supplier,
         purpose = EXCLUDED.purpose,
         product_age = EXCLUDED.product_age,
         youtube_url = EXCLUDED.youtube_url,
         image_urls = EXCLUDED.image_urls,
         updated_at = NOW()`,
      [
        row.id,
        str(row.name, row.id),
        str(row.description, ""),
        str(row.category, ""),
        str(row.qrCode, row.id),
        str(row.status, "available"),
        num(row.loanFeeMin, 0),
        num(row.loanFeeMax, 0),
        json(row.safetyRules, "[]"),
        json(row.includedItems),
        str(row.imageUrl),
        str(row.adminNotes),
        gemachId,
        kindId,
        str(row.unitLabel),
        num(row.defaultLoanHours),
        num(row.maxLoanHours),
        str(row.location),
        str(row.brand),
        str(row.supplier),
        str(row.purpose),
        num(row.productAge),
        str(row.youtubeUrl),
        textArray(row.imageUrls),
      ]
    );
  }
  console.log(`  tools: ${rows.length}`);
}

async function importGeneric() {
  const pots = await loadCollection("device_pots");
  for (const row of pots) {
    await sql.query(
      `INSERT INTO device_pots (id, tool_id, balance, total_earned, total_spent)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET
         tool_id = EXCLUDED.tool_id,
         balance = EXCLUDED.balance,
         total_earned = EXCLUDED.total_earned,
         total_spent = EXCLUDED.total_spent`,
      [
        row.id,
        str(row.toolId, row.id),
        num(row.balance, 0),
        num(row.totalEarned, 0),
        num(row.totalSpent, 0),
      ]
    );
  }
  console.log(`  device_pots: ${pots.length}`);

  const ops = await firestore.collection("operations_pot").doc("main").get();
  if (ops.exists) {
    const d = ops.data() ?? {};
    await sql.query(
      `INSERT INTO operations_pot (id, balance, total_earned, total_spent)
       VALUES ('main',$1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET
         balance = EXCLUDED.balance,
         total_earned = EXCLUDED.total_earned,
         total_spent = EXCLUDED.total_spent`,
      [num(d.balance, 0), num(d.totalEarned, 0), num(d.totalSpent, 0)]
    );
  }
  console.log("  operations_pot: 1");

  const reservations = await loadCollection("reservations");
  for (const row of reservations) {
    await sql.query(
      `INSERT INTO reservations (
         id, member_id, tool_id, pickup_date, pickup_time_start, pickup_time_end,
         return_date, return_time_start, return_time_end, status, fee_amount,
         loan_duration_hours, kind_id, quantity, tool_ids, group_id,
         cooperative_fee_amount, cancel_reason, cancelled_at, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         fee_amount = EXCLUDED.fee_amount,
         tool_ids = EXCLUDED.tool_ids,
         quantity = EXCLUDED.quantity,
         cancel_reason = EXCLUDED.cancel_reason,
         cancelled_at = EXCLUDED.cancelled_at`,
      [
        row.id,
        str(row.memberId, ""),
        str(row.toolId, ""),
        str(row.pickupDate, str(row.date, "")),
        str(row.pickupTimeStart),
        str(row.pickupTimeEnd),
        str(row.returnDate, str(row.pickupDate, "")),
        str(row.returnTimeStart),
        str(row.returnTimeEnd),
        str(row.status, "pending"),
        num(row.feeAmount, 0),
        num(row.loanDurationHours),
        str(row.kindId),
        num(row.quantity),
        textArray(row.toolIds),
        str(row.groupId),
        num(row.cooperativeFeeAmount),
        str(row.cancelReason),
        toIso(row.cancelledAt),
        toIso(row.createdAt) ?? new Date().toISOString(),
      ]
    );
  }
  console.log(`  reservations: ${reservations.length}`);

  const loans = await loadCollection("loans");
  for (const row of loans) {
    await sql.query(
      `INSERT INTO loans (
         id, reservation_id, member_id, tool_id, tool_ids, quantity, status,
         safety_acknowledged, checkout_photo_url, return_photo_url,
         checkout_condition_notes, return_condition_notes, checkout_items_checked,
         return_items_checked, additional_photo_urls, checked_out_at,
         due_return_date, due_return_time_end, returned_at, group_id,
         checkout_defect, return_defect, return_ok, dispute_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,$23,$24
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         returned_at = EXCLUDED.returned_at,
         return_photo_url = EXCLUDED.return_photo_url,
         dispute_id = EXCLUDED.dispute_id`,
      [
        row.id,
        str(row.reservationId, ""),
        str(row.memberId, ""),
        str(row.toolId, ""),
        textArray(row.toolIds),
        num(row.quantity),
        str(row.status, "active"),
        bool(row.safetyAcknowledged),
        str(row.checkoutPhotoUrl),
        str(row.returnPhotoUrl),
        str(row.checkoutConditionNotes),
        str(row.returnConditionNotes),
        textArray(row.checkoutItemsChecked),
        textArray(row.returnItemsChecked),
        textArray(row.additionalPhotoUrls),
        toIso(row.checkedOutAt),
        str(row.dueReturnDate),
        str(row.dueReturnTimeEnd),
        toIso(row.returnedAt),
        str(row.groupId),
        json(row.checkoutDefect),
        json(row.returnDefect),
        row.returnOk === true ? true : null,
        str(row.disputeId),
      ]
    );
  }
  console.log(`  loans: ${loans.length}`);

  const payments = await loadCollection("payments");
  for (const row of payments) {
    await sql.query(
      `INSERT INTO payments (
         id, reservation_id, member_id, tool_id, amount, status, provider,
         paybox_group_url, grow_payment_url, credit_applied, created_at, paid_at, refunded_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         paid_at = EXCLUDED.paid_at,
         refunded_at = EXCLUDED.refunded_at,
         credit_applied = EXCLUDED.credit_applied`,
      [
        row.id,
        str(row.reservationId, ""),
        str(row.memberId, ""),
        str(row.toolId, ""),
        num(row.amount, 0),
        str(row.status, "pending"),
        str(row.provider, "credit"),
        str(row.payboxGroupUrl, ""),
        str(row.growPaymentUrl),
        num(row.creditApplied),
        toIso(row.createdAt) ?? new Date().toISOString(),
        toIso(row.paidAt),
        toIso(row.refundedAt),
      ]
    );
  }
  console.log(`  payments: ${payments.length}`);

  const ledger = await loadCollection("credit_ledger");
  for (const row of ledger) {
    await sql.query(
      `INSERT INTO credit_ledger (
         id, member_id, delta, balance_after, reason, note, reservation_id,
         peer_loan_id, created_by, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        str(row.memberId, ""),
        num(row.delta, 0),
        num(row.balanceAfter, 0),
        str(row.reason, "manual_adjustment"),
        str(row.note),
        str(row.reservationId),
        str(row.peerLoanId),
        str(row.createdBy, ""),
        toIso(row.createdAt) ?? new Date().toISOString(),
      ]
    );
  }
  console.log(`  credit_ledger: ${ledger.length}`);

  const creditLoans = await loadCollection("credit_loans");
  for (const row of creditLoans) {
    await sql.query(
      `INSERT INTO credit_loans (
         id, lender_id, lender_name, borrower_id, borrower_name, principal,
         outstanding, status, created_at, settled_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       )
       ON CONFLICT (id) DO UPDATE SET
         outstanding = EXCLUDED.outstanding,
         status = EXCLUDED.status,
         settled_at = EXCLUDED.settled_at`,
      [
        row.id,
        str(row.lenderId, ""),
        str(row.lenderName, ""),
        str(row.borrowerId, ""),
        str(row.borrowerName, ""),
        num(row.principal, 0),
        num(row.outstanding, 0),
        str(row.status, "open"),
        toIso(row.createdAt) ?? new Date().toISOString(),
        toIso(row.settledAt),
      ]
    );
  }
  console.log(`  credit_loans: ${creditLoans.length}`);

  const imports = await loadCollection("paybox_payment_imports");
  for (const row of imports) {
    const { id, ...rest } = row;
    await sql.query(
      `INSERT INTO paybox_payment_imports (id, data) VALUES ($1,$2::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [id, json(rest, "{}")]
    );
  }
  console.log(`  paybox_payment_imports: ${imports.length}`);

  const fees = await loadCollection("late_return_fees");
  for (const row of fees) {
    await sql.query(
      `INSERT INTO late_return_fees (
         id, loan_id, reservation_id, member_id, tool_id, gemach_id, due_at,
         returned_at, late_minutes, amount, paid, paid_at, marked_paid_by,
         cancelled, cancelled_at, cancelled_by, cancel_reason, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
       )
       ON CONFLICT (id) DO UPDATE SET
         amount = EXCLUDED.amount,
         paid = EXCLUDED.paid,
         cancelled = EXCLUDED.cancelled`,
      [
        row.id,
        str(row.loanId, ""),
        str(row.reservationId, ""),
        str(row.memberId, ""),
        str(row.toolId, ""),
        str(row.gemachId, "kerem"),
        toIso(row.dueAt) ?? new Date().toISOString(),
        toIso(row.returnedAt) ?? new Date().toISOString(),
        num(row.lateMinutes, 0),
        num(row.amount, 0),
        bool(row.paid),
        toIso(row.paidAt),
        str(row.markedPaidBy),
        bool(row.cancelled),
        toIso(row.cancelledAt),
        str(row.cancelledBy),
        str(row.cancelReason),
        toIso(row.createdAt) ?? new Date().toISOString(),
      ]
    );
  }
  console.log(`  late_return_fees: ${fees.length}`);

  const tickets = await loadCollection("maintenance_tickets");
  for (const row of tickets) {
    await sql.query(
      `INSERT INTO maintenance_tickets (
         id, tool_id, loan_id, member_id, description, status, admin_reply,
         resolved_at, resolved_by, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         admin_reply = EXCLUDED.admin_reply,
         resolved_at = EXCLUDED.resolved_at`,
      [
        row.id,
        str(row.toolId, ""),
        str(row.loanId),
        str(row.memberId, ""),
        str(row.description, ""),
        str(row.status, "open"),
        str(row.adminReply),
        toIso(row.resolvedAt),
        str(row.resolvedBy),
        toIso(row.createdAt) ?? new Date().toISOString(),
      ]
    );
  }
  console.log(`  maintenance_tickets: ${tickets.length}`);

  const disputes = await loadCollection("disputes");
  for (const row of disputes) {
    await sql.query(
      `INSERT INTO disputes (
         id, loan_id, tool_id, member_id, gemach_id, status, defect, damage_amount,
         mediator_ids, mediator_decisions, resolved_at, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         mediator_ids = EXCLUDED.mediator_ids,
         mediator_decisions = EXCLUDED.mediator_decisions,
         resolved_at = EXCLUDED.resolved_at`,
      [
        row.id,
        str(row.loanId, ""),
        str(row.toolId, ""),
        str(row.memberId, ""),
        str(row.gemachId, "kerem"),
        str(row.status, "new"),
        json(row.defect, "{}"),
        num(row.damageAmount),
        textArray(row.mediatorIds) ?? [],
        json(row.mediatorDecisions),
        toIso(row.resolvedAt),
        toIso(row.createdAt) ?? new Date().toISOString(),
      ]
    );
  }
  console.log(`  disputes: ${disputes.length}`);

  const txns = await loadCollection("transactions");
  for (const row of txns) {
    await sql.query(
      `INSERT INTO transactions (
         id, member_id, tool_id, loan_id, amount, operations_amount, device_amount, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        str(row.memberId, ""),
        str(row.toolId, ""),
        str(row.loanId, ""),
        num(row.amount, 0),
        num(row.operationsAmount, 0),
        num(row.deviceAmount, 0),
        toIso(row.createdAt) ?? new Date().toISOString(),
      ]
    );
  }
  console.log(`  transactions: ${txns.length}`);

  const payouts = await loadCollection("paybox_payouts");
  for (const row of payouts) {
    await sql.query(
      `INSERT INTO paybox_payouts (
         id, pot_target, tool_id, amount, group_url, status, note, created_by,
         created_at, completed_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       )
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         completed_at = EXCLUDED.completed_at`,
      [
        row.id,
        str(row.potTarget, "operations"),
        str(row.toolId),
        num(row.amount, 0),
        str(row.groupUrl, ""),
        str(row.status, "pending"),
        str(row.note),
        str(row.createdBy, ""),
        toIso(row.createdAt) ?? new Date().toISOString(),
        toIso(row.completedAt),
      ]
    );
  }
  console.log(`  paybox_payouts: ${payouts.length}`);

  const settings = await loadCollection("settings");
  for (const row of settings) {
    const { id, ...rest } = row;
    await sql.query(
      `INSERT INTO settings (id, data) VALUES ($1,$2::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
      [id, json(rest, "{}")]
    );
  }
  console.log(`  settings: ${settings.length}`);
}

async function main() {
  console.log("Copying Firestore → Neon…");
  await importGemachim();
  await importMembers();
  await importTools();
  await importGeneric();
  console.log("Import finished.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
