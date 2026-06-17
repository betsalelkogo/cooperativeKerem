import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { completeLoanReturn, getLoanById } from "@/lib/firestore/repository";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);

    const formData = await request.formData();
    const loanId = formData.get("loanId") as string | null;
    const photo = formData.get("photo") as File | null;

    if (!loanId || !photo) {
      return NextResponse.json({ error: "נדרשים מזהה השאלה ותמונה" }, { status: 400 });
    }

    const loan = await getLoanById(loanId);
    if (!loan) {
      return NextResponse.json({ error: "ההשאלה לא נמצאה" }, { status: 404 });
    }

    if (memberId && loan.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    if (loan.status !== "active") {
      return NextResponse.json({ error: "ההשאלה אינה פעילה" }, { status: 409 });
    }

    const updated = await completeLoanReturn(loanId, `/uploads/${photo.name}`);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
