import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  getDisputeById,
  submitMediatorDecision,
  getMemberById,
} from "@/lib/firestore/repository";
import { isDisputeResolver } from "@/lib/admin";
import type { MediatorDecision } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const member = await getMemberById(memberId);
    if (!member || !isDisputeResolver(member)) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { decision } = body as { decision?: MediatorDecision };

    if (
      decision !== "charge_member" &&
      decision !== "waive_member" &&
      decision !== "abstain"
    ) {
      return NextResponse.json({ error: "החלטה לא תקינה" }, { status: 400 });
    }

    const dispute = await getDisputeById(id);
    if (!dispute) {
      return NextResponse.json({ error: "המחלוקת לא נמצאה" }, { status: 404 });
    }

    const updated = await submitMediatorDecision({
      disputeId: id,
      mediatorId: memberId,
      decision,
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
