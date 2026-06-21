import { NextResponse } from "next/server";
import { isBoardMember, isPlatformAdmin } from "@/lib/admin";
import { requireDisputeViewer } from "@/lib/firebase/admin-auth";
import { listDisputesForAdmin } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  const auth = await requireDisputeViewer(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const viewAll =
      isPlatformAdmin(auth.member) || isBoardMember(auth.member);
    const disputes = await listDisputesForAdmin({
      viewerId: auth.uid,
      viewAll,
    });
    return NextResponse.json(disputes);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
