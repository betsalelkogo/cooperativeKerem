import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { updateMemberName } from "@/lib/firestore/repository";
import { cleanNamePart, isValidNamePart } from "@/lib/name";

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const firstName = typeof body?.firstName === "string" ? body.firstName : "";
    const familyName = typeof body?.familyName === "string" ? body.familyName : "";

    if (!isValidNamePart(firstName) || !isValidNamePart(familyName)) {
      return NextResponse.json(
        { error: "יש להזין שם פרטי ושם משפחה" },
        { status: 400 }
      );
    }

    const member = await updateMemberName(
      uid,
      cleanNamePart(firstName),
      cleanNamePart(familyName)
    );
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
