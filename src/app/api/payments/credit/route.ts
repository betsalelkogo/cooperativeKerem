import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  getGemachById,
  getReservationById,
  getToolById,
} from "@/lib/firestore/repository";
import { isPlatformGemach } from "@/lib/gemach";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const { reservationId } = body as { reservationId?: string };
    if (!reservationId) {
      return NextResponse.json({ error: "חסר מזהה שריון" }, { status: 400 });
    }

    const reservation = await getReservationById(reservationId);
    if (!reservation) {
      return NextResponse.json({ error: "השריון לא נמצא" }, { status: 404 });
    }
    if (reservation.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }
    if (reservation.feeAmount <= 0) {
      return NextResponse.json({ error: "אין דמי השאלה לתשלום" }, { status: 400 });
    }

    const tool = await getToolById(reservation.toolId);
    const gemach = tool ? await getGemachById(tool.gemachId) : null;
    if (!gemach || !isPlatformGemach(gemach)) {
      return NextResponse.json(
        { error: "תשלום מהיתרה זמין רק בקואופרטיב" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error:
          "דמי ההשאלה יורדים מהיתרה רק בעת הלקיחה בפועל. אפשר לבטל שריון בלי חיוב.",
      },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
