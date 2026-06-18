import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import { markLateReturnFeePaid } from "@/lib/firestore/repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const fee = await markLateReturnFeePaid(id, auth.uid);
    return NextResponse.json(fee);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
