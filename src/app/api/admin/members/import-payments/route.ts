import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import { applyPayboxImportRow, listMembers } from "@/lib/firestore/repository";
import { readXlsxRows } from "@/lib/xlsx-reader";

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
    if (columns.notes === undefined) {
      return NextResponse.json(
        { error: "לא נמצאה עמודת 'הערות' (בה החברים מזינים את האימייל)" },
        { status: 400 }
      );
    }

    const members = await listMembers();
    const emailToMember = new Map(
      members
        .filter((m) => m.email)
        .map((m) => [m.email.trim().toLowerCase(), m])
    );

    const applied: Array<{
      name: string;
      email: string;
      amount: number;
      balance: number;
      date: string;
    }> = [];
    const duplicates: Array<{ email: string; amount: number; date: string }> = [];
    const unmatched: Array<{ row: number; email: string; amount: number }> = [];
    const missingEmail: Array<{ row: number; name: string; amount: number }> = [];
    const errors: Array<{ row: number; message: string }> = [];
    let skippedNonPayment = 0;
    let totalApplied = 0;

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

      const emailMatch = notes.match(EMAIL_REGEX);
      const email = emailMatch ? emailMatch[0].trim().toLowerCase() : "";
      if (!email) {
        missingEmail.push({ row: rowNumber, name, amount });
        continue;
      }

      const member = emailToMember.get(email);
      if (!member) {
        unmatched.push({ row: rowNumber, email, amount });
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
          duplicates.push({ email, amount, date: dateText });
        } else {
          applied.push({
            name: member.name,
            email,
            amount,
            balance: result.balance,
            date: dateText,
          });
          totalApplied += amount;
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
        duplicateCount: duplicates.length,
        unmatchedCount: unmatched.length,
        missingEmailCount: missingEmail.length,
        skippedNonPayment,
        errorCount: errors.length,
      },
      applied,
      duplicates,
      unmatched,
      missingEmail,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
