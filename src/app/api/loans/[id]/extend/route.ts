import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { extendActiveLoan } from "@/lib/firestore/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }
    const { id } = await params;
    const loan = await extendActiveLoan({ loanId: id, memberId: uid });
    return NextResponse.json({ loan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    const status = message.includes("יתרה")
      ? 402
      : message.includes("משוריין") || message.includes("נפתחת")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
