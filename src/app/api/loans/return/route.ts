import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { completeLoanReturn, getLoanById } from "@/lib/firestore/repository";
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
    const loanIdsRaw = formData.get("loanIds") as string | null;
    const photo = formData.get("photo") as File | null;
    const returnConditionNotes = formData.get("returnConditionNotes") as string | null;
    const returnItemsRaw = formData.get("returnItemsChecked") as string | null;

    let loanIds: string[] = loanId ? [loanId] : [];
    if (loanIdsRaw) {
      try {
        const parsed = JSON.parse(loanIdsRaw);
        if (Array.isArray(parsed)) {
          loanIds = parsed.filter((id): id is string => typeof id === "string");
        }
      } catch {
        // fall back to single loanId
      }
    }

    let returnItemsChecked: string[] = [];
    if (returnItemsRaw) {
      try {
        returnItemsChecked = JSON.parse(returnItemsRaw) as string[];
      } catch {
        returnItemsChecked = [];
      }
    }

    const returnDefectRaw = formData.get("returnDefect") as string | null;
    const returnOkRaw = formData.get("returnOk") as string | null;
    let returnDefect;
    if (returnDefectRaw) {
      try {
        returnDefect = JSON.parse(returnDefectRaw);
      } catch {
        returnDefect = undefined;
      }
    }

    if (loanIds.length === 0 || !photo) {
      return NextResponse.json({ error: "נדרשים מזהה השאלה ותמונה" }, { status: 400 });
    }

    const loans = await Promise.all(loanIds.map((id) => getLoanById(id)));
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
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
    }

    const buffer = await readImageUpload(photo);
    const returnPhotoUrl = await uploadLoanReturnPhoto({
      loanId: loanIds[0],
      buffer,
    });

    const results: Awaited<ReturnType<typeof completeLoanReturn>>[] = [];
    for (const id of loanIds) {
      const result = await completeLoanReturn(id, {
        returnPhotoUrl,
        returnConditionNotes: returnConditionNotes ?? undefined,
        returnItemsChecked,
        returnOk: returnOkRaw === "true",
        returnDefect,
      });
      results.push(result);
    }

    const firstLateFee = results.find((r) => r.lateFee)?.lateFee ?? null;
    const firstDispute = results.find((r) => r.dispute)?.dispute ?? null;
    return NextResponse.json({
      loan: results[0].loan,
      loans: results.map((r) => r.loan),
      lateFee: firstLateFee,
      lateFees: results.map((r) => r.lateFee).filter(Boolean),
      dispute: firstDispute,
      returnedCount: results.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
