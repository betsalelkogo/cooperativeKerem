import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getLoanById, getToolById } from "@/lib/firestore/repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(request);
    const { id } = await params;

    const loan = await getLoanById(id);
    if (!loan) {
      return NextResponse.json({ error: "ההשאלה לא נמצאה" }, { status: 404 });
    }

    if (memberId && loan.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const tool = await getToolById(loan.toolId);
    return NextResponse.json({ loan, tool });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
