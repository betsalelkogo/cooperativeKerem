import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createReservation,
  getReservationsByMember,
  getToolById,
  updateToolStatus,
} from "@/lib/firestore/repository";

export async function GET(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const reservations = await getReservationsByMember(memberId);
    const active = reservations.filter(
      (r) => r.status === "pending" || r.status === "confirmed"
    );

    const withTools = await Promise.all(
      active.map(async (reservation) => ({
        reservation,
        tool: await getToolById(reservation.toolId),
      }))
    );

    return NextResponse.json(withTools);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const { toolId, pickupDate, returnDate, date } = body as {
      toolId?: string;
      pickupDate?: string;
      returnDate?: string;
      date?: string;
    };

    const resolvedPickup = pickupDate ?? date;

    if (!toolId || !resolvedPickup || !returnDate) {
      return NextResponse.json(
        { error: "נדרשים מזהה כלי, תאריך איסוף ותאריך החזרה" },
        { status: 400 }
      );
    }

    if (returnDate < resolvedPickup) {
      return NextResponse.json(
        { error: "תאריך החזרה חייב להיות באותו יום או אחרי תאריך האיסוף" },
        { status: 400 }
      );
    }

    const tool = await getToolById(toolId);
    if (!tool) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    if (tool.status !== "available") {
      return NextResponse.json({ error: "הכלי אינו זמין" }, { status: 409 });
    }

    const reservation = await createReservation({
      memberId,
      toolId,
      pickupDate: resolvedPickup,
      returnDate,
      status: "confirmed",
      feeAmount: tool.loanFeeMin,
    });

    await updateToolStatus(toolId, "reserved");

    return NextResponse.json(reservation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
