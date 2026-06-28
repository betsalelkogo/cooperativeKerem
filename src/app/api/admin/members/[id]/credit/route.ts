import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import { adjustMemberCredit, getMemberCreditLedger } from "@/lib/firestore/repository";
import type { CreditLedgerReason } from "@/lib/types";

const ALLOWED_REASONS: CreditLedgerReason[] = [
  "manual_adjustment",
  "tool_sale",
  "refund",
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { delta, note, reason } = body as {
      delta?: number;
      note?: string;
      reason?: CreditLedgerReason;
    };

    if (typeof delta !== "number" || !Number.isFinite(delta) || delta === 0) {
      return NextResponse.json(
        { error: "יש להזין סכום עדכון תקין (חיובי או שלילי)" },
        { status: 400 }
      );
    }

    const resolvedReason: CreditLedgerReason =
      reason && ALLOWED_REASONS.includes(reason) ? reason : "manual_adjustment";

    const { balance, entry } = await adjustMemberCredit({
      memberId: id,
      delta,
      reason: resolvedReason,
      note: note?.trim() || undefined,
      createdBy: auth.uid,
    });

    const ledger = await getMemberCreditLedger(id);
    return NextResponse.json({ creditBalance: balance, entry, ledger });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
