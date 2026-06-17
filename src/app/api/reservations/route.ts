import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createReservation,
  getToolById,
  updateToolStatus,
} from "@/lib/firestore/repository";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const { toolId, date } = body as { toolId?: string; date?: string };

    if (!toolId || !date) {
      return NextResponse.json({ error: "נדרשים מזהה כלי ותאריך" }, { status: 400 });
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
      date,
      status: "confirmed",
      feeAmount: tool.loanFeeMin,
    });

    await updateToolStatus(toolId, "reserved");

    return NextResponse.json(reservation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
