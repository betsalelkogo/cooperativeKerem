import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { syncMemberFromAuth } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "חסר token" }, { status: 401 });
    }

    const { getAdminAuth } = await import("@/lib/firebase/admin");
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({ error: "Firebase Admin לא מוגדר" }, { status: 503 });
    }

    const decoded = await auth.verifyIdToken(authHeader.slice(7));

    const member = await syncMemberFromAuth({
      uid,
      name: decoded.name ?? decoded.email ?? "חבר",
      email: decoded.email ?? "",
      photoURL: decoded.picture,
    });

    return NextResponse.json({ member });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
