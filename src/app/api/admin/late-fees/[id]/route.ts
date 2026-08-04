import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import {
  cancelLateReturnFee,
  markLateReturnFeePaid,
} from "@/lib/firestore/repository";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    let action: "paid" | "cancel" = "paid";
    let cancelReason: string | undefined;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as {
        action?: string;
        cancelReason?: string;
      };
      if (body.action === "cancel") action = "cancel";
      else if (body.action === "paid" || body.action === undefined) action = "paid";
      else {
        return NextResponse.json({ error: "פעולה לא נתמכת" }, { status: 400 });
      }
      cancelReason = body.cancelReason;
    }

    const fee =
      action === "cancel"
        ? await cancelLateReturnFee(id, auth.uid, cancelReason)
        : await markLateReturnFeePaid(id, auth.uid);

    return NextResponse.json(fee);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
