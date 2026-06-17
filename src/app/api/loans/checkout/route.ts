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

    if (memberId && reservation.memberId !== memberId) {
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
    const status = message.includes("Payment required") ? 402 : 500;
    return NextResponse.json(
      { error: status === 402 ? "נדרש תשלום לפני לקיחת הכלי" : "שגיאת שרת" },
      { status }
    );
  }
}
