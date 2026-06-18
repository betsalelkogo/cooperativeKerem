import { NextResponse } from "next/server";
import {
  requireAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import { createToolsForGemach, getGemachById } from "@/lib/firestore/repository";
import { validateToolInput } from "@/lib/tools-admin";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const {
      gemachId: requestedGemachId,
      name,
      description,
      category,
      quantity,
      loanFeeMin,
      loanFeeMax,
      kindId,
      defaultLoanHours,
      maxLoanHours,
    } = body as {
      gemachId?: string;
      name?: string;
      description?: string;
      category?: string;
      quantity?: number;
      loanFeeMin?: number;
      loanFeeMax?: number;
      kindId?: string;
      defaultLoanHours?: number;
      maxLoanHours?: number;
    };

    const gemachId = resolveGemachAdminScope(auth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const validationError = validateToolInput({ name, description, category, quantity });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const gemach = await getGemachById(gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }
    if (!gemach.active) {
      return NextResponse.json({ error: "הגמ״ח סגור — לא ניתן להוסיף כלים" }, { status: 403 });
    }

    const result = await createToolsForGemach({
      gemachId,
      name: name!,
      description: description!,
      category: category!,
      quantity: Number(quantity),
      loanFeeMin: Number(loanFeeMin ?? 0),
      loanFeeMax: Number(loanFeeMax ?? loanFeeMin ?? 0),
      kindId,
      defaultLoanHours:
        defaultLoanHours !== undefined ? Number(defaultLoanHours) : undefined,
      maxLoanHours: maxLoanHours !== undefined ? Number(maxLoanHours) : undefined,
      createdBy: auth.uid,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
