import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { completePayboxPayout } from "@/lib/firestore/repository";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const memberId = await getUidFromRequest(_request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const { id } = await params;
    const payout = await completePayboxPayout(id);
    return NextResponse.json(payout);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
