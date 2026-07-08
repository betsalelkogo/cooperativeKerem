import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import { applyPayboxImportRow, listMembers } from "@/lib/firestore/repository";
import { readXlsxRows } from "@/lib/xlsx-reader";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Header aliases -> logical column. Matched case-insensitively after trim. */
const HEADER_ALIASES: Record<string, string[]> = {
  amount: ["סכום", "amount", "sum"],
  notes: ["הערות", "הערה", "notes", "note"],
  type: ["סוג", "type"],
  date: ["תאריך", "date"],
  phone: ["פלאפון", "טלפון", "phone"],
  name: ["שם", "name"],
};

function parseAmount(value: string): number {
  const cleaned = value.replace(/[₪,\s]/g, "");
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function resolveColumns(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((cell, index) => {
    const label = cell.trim().toLowerCase();
    if (!label) return;
    for (const [logical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[logical] === undefined && aliases.some((a) => a.toLowerCase() === label)) {
        map[logical] = index;
      }
    }
  });
  return map;
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "לא נבחר קובץ" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "הקובץ ריק" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "הקובץ גדול מדי (מקסימום 5MB)" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "יש להעלות קובץ Excel בפורמט ‎.xlsx" },
        { status: 400 }
      );
    }

    let rows: string[][];
    try {
      rows = readXlsxRows(await file.arrayBuffer());
    } catch (err) {
      const message = err instanceof Error ? err.message : "לא ניתן לקרוא את הקובץ";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (rows.length < 2) {
      return NextResponse.json({ error: "הגיליון ריק או ללא נתונים" }, { status: 400 });
    }

    const columns = resolveColumns(rows[0]);
    if (columns.amount === undefined) {
      return NextResponse.json(
        { error: "לא נמצאה עמודת 'סכום' בקובץ" },
        { status: 400 }
      );
    }
    if (columns.phone === undefined && columns.notes === undefined) {
      return NextResponse.json(
        { error: "לא נמצאה עמודת 'פלאפון' או 'הערות' לזיהוי החבר" },
        { status: 400 }
      );
    }

    const members = await listMembers();
    const emailToMember = new Map(
      members
        .filter((m) => m.email)
        .map((m) => [m.email.trim().toLowerCase(), m])
    );

    // Members are matched primarily by phone. If two members share the same
    // normalized number we can't safely credit either, so those numbers are
    // excluded from phone matching (email-in-notes still works for them).
    const phoneToMember = new Map<string, (typeof members)[number]>();
    const ambiguousPhones = new Set<string>();
    for (const m of members) {
      const key = m.phone ? normalizePhone(m.phone) : "";
      if (!key) continue;
      if (phoneToMember.has(key)) ambiguousPhones.add(key);
      else phoneToMember.set(key, m);
    }

    const applied: Array<{
      name: string;
      identifier: string;
      amount: number;
      membershipFee: number;
      gross: number;
      balance: number;
      date: string;
      matchedBy: "phone" | "email";
      becameMember: boolean;
    }> = [];
    const duplicates: Array<{ identifier: string; amount: number; date: string }> = [];
    const unmatched: Array<{ row: number; identifier: string; amount: number }> = [];
    const notMember: Array<{
      row: number;
      name: string;
      identifier: string;
      amount: number;
    }> = [];
    const errors: Array<{ row: number; message: string }> = [];
    let skippedNonPayment = 0;
    let totalApplied = 0;
    let totalMembershipFee = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      const cell = (index?: number) =>
        index !== undefined ? (row[index] ?? "").trim() : "";

      const notes = cell(columns.notes);
      const name = cell(columns.name);
      const phone = cell(columns.phone);
      const dateText = cell(columns.date);
      const typeText = cell(columns.type).toLowerCase();
      const amountText = cell(columns.amount);

      const hasAnyData = notes || name || phone || amountText;
      if (!hasAnyData) continue;

      if (columns.type !== undefined && typeText && typeText !== "payment") {
        skippedNonPayment++;
        continue;
      }

      const amount = parseAmount(amountText);
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push({ row: rowNumber, message: "סכום לא תקין" });
        continue;
      }

      // Primary match: phone. Fallback: an email typed into the notes column.
      const phoneKey = normalizePhone(phone);
      const emailMatch = notes.match(EMAIL_REGEX);
      const email = emailMatch ? emailMatch[0].trim().toLowerCase() : "";

      let member: (typeof members)[number] | undefined;
      let matchedBy: "phone" | "email" = "phone";
      if (phoneKey && !ambiguousPhones.has(phoneKey)) {
        member = phoneToMember.get(phoneKey);
      }
      if (!member && email) {
        member = emailToMember.get(email);
        matchedBy = "email";
      }

      const identifier = phone || email || "—";
      if (!member) {
        unmatched.push({ row: rowNumber, identifier, amount });
        continue;
      }

      const importKey = createHash("sha256")
        .update(`${member.id}|${phone}|${dateText}|${amount}|${notes}`)
        .digest("hex");

      try {
        const note = `טעינת PayBox${dateText ? ` · ${dateText}` : ""}${
          name ? ` · ${name}` : ""
        }`;
        const result = await applyPayboxImportRow({
          memberId: member.id,
          amount,
          importKey,
          note,
          createdBy: auth.uid,
        });
        if (result.status === "duplicate") {
          duplicates.push({ identifier, amount, date: dateText });
        } else if (result.status === "rejected_not_member") {
          notMember.push({ row: rowNumber, name: member.name, identifier, amount });
        } else {
          applied.push({
            name: member.name,
            identifier,
            amount: result.credited,
            membershipFee: result.membershipFee,
            gross: amount,
            balance: result.balance,
            date: dateText,
            matchedBy,
            becameMember: result.becameMember,
          });
          totalApplied += result.credited;
          totalMembershipFee += result.membershipFee;
        }
      } catch (err) {
        errors.push({
          row: rowNumber,
          message: err instanceof Error ? err.message : "שגיאה בעדכון היתרה",
        });
      }
    }

    return NextResponse.json({
      summary: {
        appliedCount: applied.length,
        totalApplied: Math.round(totalApplied * 100) / 100,
        totalMembershipFee: Math.round(totalMembershipFee * 100) / 100,
        duplicateCount: duplicates.length,
        unmatchedCount: unmatched.length,
        notMemberCount: notMember.length,
        skippedNonPayment,
        errorCount: errors.length,
      },
      applied,
      duplicates,
      unmatched,
      notMember,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
