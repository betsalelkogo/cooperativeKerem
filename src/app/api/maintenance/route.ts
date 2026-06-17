import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { createMaintenanceTicket, getToolById } from "@/lib/firestore/repository";

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const { toolId, loanId, description } = body as {
      toolId?: string;
      loanId?: string;
      description?: string;
    };

    if (!toolId || !description) {
      return NextResponse.json(
        { error: "נדרשים מזהה כלי ותיאור התקלה" },
        { status: 400 }
      );
    }

    const tool = await getToolById(toolId);
    if (!tool) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    const ticket = await createMaintenanceTicket({
      toolId,
      loanId,
      memberId,
      description,
    });

    return NextResponse.json(ticket, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
