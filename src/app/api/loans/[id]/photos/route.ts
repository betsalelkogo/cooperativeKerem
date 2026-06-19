import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { addLoanPhoto, getLoanById } from "@/lib/firestore/repository";
import {
  isCloudinaryConfigured,
  cloudinaryNotConfiguredMessage,
  readImageUpload,
  uploadLoanExtraPhoto,
} from "@/lib/cloudinary-admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ error: cloudinaryNotConfiguredMessage() }, { status: 503 });
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

    const buffer = await readImageUpload(photo);
    const photoUrl = await uploadLoanExtraPhoto(loanId, buffer);
    const updated = await addLoanPhoto(loanId, photoUrl);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
