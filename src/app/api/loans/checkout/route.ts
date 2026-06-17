import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createLoanFromCheckout,
  getReservationById,
  getToolById,
} from "@/lib/firestore/repository";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const formData = await request.formData();
    const reservationId = formData.get("reservationId") as string | null;
    const photo = formData.get("photo") as File | null;

    if (!reservationId || !photo) {
      return NextResponse.json(
        { error: "נדרשים מזהה שריון ותמונה" },
        { status: 400 }
      );
    }

    const reservation = await getReservationById(reservationId);
    if (!reservation) {
      return NextResponse.json({ error: "השריון לא נמצא" }, { status: 404 });
    }

    if (reservation.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const tool = await getToolById(reservation.toolId);
    if (!tool) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    const loan = await createLoanFromCheckout({
      reservation,
      checkoutPhotoUrl: `/uploads/${photo.name}`,
    });

    return NextResponse.json(loan, { status: 201 });
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
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
