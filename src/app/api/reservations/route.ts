import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createReservation,
  getReservationsByMember,
  getToolById,
  getGemachById,
  updateToolStatus,
  resolveReservationFee,
  pickAvailableToolUnit,
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
    const { toolId, kindId, pickupDate, returnDate, date } = body as {
      toolId?: string;
      kindId?: string;
      pickupDate?: string;
      returnDate?: string;
      date?: string;
    };

    const catalogKey = kindId ?? toolId;
    const resolvedPickup = pickupDate ?? date;

    if (!catalogKey || !resolvedPickup || !returnDate) {
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

    let tool = await pickAvailableToolUnit(catalogKey);
    if (!tool) {
      const direct = await getToolById(catalogKey);
      if (direct?.status === "available") {
        tool = direct;
      }
    }

    if (!tool) {
      return NextResponse.json({ error: "אין יחידה זמינה מסוג זה כרגע" }, { status: 409 });
    }

    const gemach = await getGemachById(tool.gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }

    if (!gemach.active) {
      return NextResponse.json({ error: "הגמ״ח סגור — לא ניתן לשמור כלים" }, { status: 403 });
    }

    const feeAmount = resolveReservationFee(gemach, tool);

    const reservation = await createReservation({
      memberId,
      toolId: tool.id,
      pickupDate: resolvedPickup,
      returnDate,
      status: "confirmed",
      feeAmount,
    });

    await updateToolStatus(tool.id, "reserved");

    return NextResponse.json(reservation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
