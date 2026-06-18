import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import { getMemberHistory, updateMemberRole } from "@/lib/firestore/repository";
import type { MemberRole } from "@/lib/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const history = await getMemberHistory(id);
    if (!history) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 404 });
    }
    return NextResponse.json(history);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { role } = body as { role?: MemberRole };

    if (!role || !["ADMIN", "MEMBER", "GEMACH_ADMIN"].includes(role)) {
      return NextResponse.json({ error: "תפקיד לא תקין" }, { status: 400 });
    }

    if (id === auth.uid && role !== "ADMIN") {
      return NextResponse.json({ error: "לא ניתן להסיר הרשאות מעצמך" }, { status: 400 });
    }

    const member = await updateMemberRole(id, role);
    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
