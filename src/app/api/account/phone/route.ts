import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { updateMemberPhone } from "@/lib/firestore/repository";
import { isValidPhone, phoneDigits } from "@/lib/phone";

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const raw = typeof body?.phone === "string" ? body.phone : "";

    if (!isValidPhone(raw)) {
      return NextResponse.json(
        { error: "יש להזין מספר טלפון תקין" },
        { status: 400 }
      );
    }

    const member = await updateMemberPhone(uid, phoneDigits(raw));
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
