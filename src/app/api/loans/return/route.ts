import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { completeLoanReturn, getLoanById, getMemberById } from "@/lib/firestore/repository";
import {
  isCloudinaryConfigured,
  cloudinaryNotConfiguredMessage,
  readImageUpload,
  uploadLoanReturnPhoto,
} from "@/lib/cloudinary-admin";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ error: cloudinaryNotConfiguredMessage() }, { status: 503 });
    }

    const formData = await request.formData();
    const loanId = formData.get("loanId") as string | null;
    const photo = formData.get("photo") as File | null;
    const returnConditionNotes = formData.get("returnConditionNotes") as string | null;
    const returnItemsRaw = formData.get("returnItemsChecked") as string | null;

    let returnItemsChecked: string[] = [];
    if (returnItemsRaw) {
      try {
        returnItemsChecked = JSON.parse(returnItemsRaw) as string[];
      } catch {
        returnItemsChecked = [];
      }
    }

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
      return NextResponse.json(
        { error: "ניתן לסגור רק השאלה פעילה — ההשאלה כבר לא פעילה" },
        { status: 409 }
      );
    }

    const buffer = await readImageUpload(photo);
    const member = await getMemberById(loan.memberId);
    const memberName =
      member?.name ?? member?.email?.split("@")[0] ?? loan.memberId.slice(0, 8);
    const returnPhotoUrl = await uploadLoanReturnPhoto({
      memberName,
      buffer,
    });

    const { loan: updatedLoan, lateFee } = await completeLoanReturn(loanId, {
      returnPhotoUrl,
      returnConditionNotes: returnConditionNotes ?? undefined,
      returnItemsChecked,
    });
    return NextResponse.json({ loan: updatedLoan, lateFee });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
