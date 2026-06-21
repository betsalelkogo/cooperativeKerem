import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createLoanFromCheckout,
  expireNoShowReservationIfNeeded,
  getReservationById,
  getToolById,
} from "@/lib/firestore/repository";
import { canStartCheckout } from "@/lib/reservation-checkout";
import {
  isCloudinaryConfigured,
  cloudinaryNotConfiguredMessage,
  readImageUpload,
  uploadLoanCheckoutPhoto,
} from "@/lib/cloudinary-admin";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json({ error: cloudinaryNotConfiguredMessage() }, { status: 503 });
    }

    const formData = await request.formData();
    const reservationId = formData.get("reservationId") as string | null;
    const photo = formData.get("photo") as File | null;
    const checkoutConditionNotes = formData.get("checkoutConditionNotes") as string | null;
    const checkoutItemsRaw = formData.get("checkoutItemsChecked") as string | null;

    let checkoutItemsChecked: string[] = [];
    if (checkoutItemsRaw) {
      try {
        checkoutItemsChecked = JSON.parse(checkoutItemsRaw) as string[];
      } catch {
        checkoutItemsChecked = [];
      }
    }

    const checkoutDefectRaw = formData.get("checkoutDefect") as string | null;
    let checkoutDefect;
    if (checkoutDefectRaw) {
      try {
        checkoutDefect = JSON.parse(checkoutDefectRaw);
      } catch {
        checkoutDefect = undefined;
      }
    }

    if (!reservationId || !photo) {
      return NextResponse.json(
        { error: "נדרשים מזהה שריון ותמונה" },
        { status: 400 }
      );
    }

    const reservation =
      (await expireNoShowReservationIfNeeded(reservationId)) ??
      (await getReservationById(reservationId));
    if (!reservation) {
      return NextResponse.json({ error: "השריון לא נמצא" }, { status: 404 });
    }

    if (reservation.status === "cancelled" && reservation.cancelReason === "no_show") {
      return NextResponse.json(
        { error: "חלף מועד האיסוף — השריון בוטל אוטומטית והכלי שוחרר" },
        { status: 409 }
      );
    }

    if (reservation.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const tool = await getToolById(reservation.toolId);
    if (!tool) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    const checkoutGate = canStartCheckout(reservation, tool);
    if (!checkoutGate.allowed) {
      return NextResponse.json({ error: checkoutGate.reason }, { status: 409 });
    }

    const buffer = await readImageUpload(photo);
    const loanId = `loan-${Date.now()}`;
    const checkoutPhotoUrl = await uploadLoanCheckoutPhoto({
      loanId,
      buffer,
    });

    const { loan, loans } = await createLoanFromCheckout({
      reservation,
      checkoutPhotoUrl,
      checkoutConditionNotes: checkoutConditionNotes ?? undefined,
      checkoutItemsChecked,
      checkoutDefect,
      loanId,
    });

    return NextResponse.json({ loan, loans }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";

    if (message.includes("Payment required")) {
      return NextResponse.json(
        { error: "נדרש תשלום לפני לקיחת הכלי — אשרו תשלום PayBox קודם" },
        { status: 402 }
      );
    }
    if (message.includes("Firebase Admin not configured")) {
      return NextResponse.json(
        { error: "שרת לא מוגדר — חסרים Firebase Admin credentials" },
        { status: 503 }
      );
    }

    console.error("[api/loans/checkout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
