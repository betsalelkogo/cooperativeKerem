import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getMemberById } from "@/lib/firestore/repository";
import { isAdminMember } from "@/lib/admin";

export async function requireAdmin(
  request: Request
): Promise<{ uid: string } | NextResponse> {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
  }

  const member = await getMemberById(uid);
  if (!member) {
    return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 });
  }

  if (!isAdminMember(member)) {
    return NextResponse.json({ error: "גישה למנהלים בלבד" }, { status: 403 });
  }

  return { uid };
}
