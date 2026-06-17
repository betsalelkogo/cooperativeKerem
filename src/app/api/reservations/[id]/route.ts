import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getReservationById, getToolById } from "@/lib/firestore/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(_request);
    const { id } = await params;

    const reservation = await getReservationById(id);
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
