import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { dismissMembershipOffer } from "@/lib/firestore/repository";

/** Dismiss the optional join offer shown after phone registration. */
export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const member = await dismissMembershipOffer(uid);
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
