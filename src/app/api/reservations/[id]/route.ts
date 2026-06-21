import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  cancelReservation,
  expireNoShowReservationIfNeeded,
  getPaidPaymentForReservation,
  getReservationById,
  getToolById,
} from "@/lib/firestore/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(_request);
    const { id } = await params;

    const reservation =
      (await expireNoShowReservationIfNeeded(id)) ??
      (await getReservationById(id));
    if (!reservation) {
      return NextResponse.json({ error: "השריון לא נמצא" }, { status: 404 });
    }

    if (memberId && reservation.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const tool = await getToolById(reservation.toolId);
    return NextResponse.json({ reservation, tool });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const { id } = await params;
    const paidBeforeCancel = await getPaidPaymentForReservation(id);
    const reservation = await cancelReservation(id, memberId);

    return NextResponse.json({
      reservation,
      hadPaidPayment: Boolean(paidBeforeCancel),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    const status = message.includes("לא נמצא") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
