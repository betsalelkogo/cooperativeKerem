import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { addLoanPhoto, getLoanById } from "@/lib/firestore/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const { id: loanId } = await params;
    const formData = await request.formData();
    const photo = formData.get("photo") as File | null;

    if (!photo) {
      return NextResponse.json({ error: "נדרשת תמונה" }, { status: 400 });
    }

    const loan = await getLoanById(loanId);
    if (!loan) {
      return NextResponse.json({ error: "ההשאלה לא נמצאה" }, { status: 404 });
    }
    if (loan.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const updated = await addLoanPhoto(loanId, `/uploads/${photo.name}`);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
