import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/admin-auth";
import { completePayboxPayout } from "@/lib/firestore/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {

    const { id } = await params;
    const payout = await completePayboxPayout(id);
    return NextResponse.json(payout);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
