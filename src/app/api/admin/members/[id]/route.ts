import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import {
  getMemberHistory,
  updateMemberFlags,
  updateMemberRole,
} from "@/lib/firestore/repository";
import type { AdminMemberSummary, MemberRole } from "@/lib/types";

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
    const { role, isAmember, firstPayout } = body as {
      role?: MemberRole;
      isAmember?: boolean;
      firstPayout?: boolean;
    };

    const hasFlagUpdate =
      typeof isAmember === "boolean" || typeof firstPayout === "boolean";

    if (role === undefined && !hasFlagUpdate) {
      return NextResponse.json({ error: "לא נשלח עדכון" }, { status: 400 });
    }

    let member: AdminMemberSummary | undefined;

    if (role !== undefined) {
      if (!["ADMIN", "MEMBER", "GEMACH_ADMIN"].includes(role)) {
        return NextResponse.json({ error: "תפקיד לא תקין" }, { status: 400 });
      }
      if (id === auth.uid && role !== "ADMIN") {
        return NextResponse.json({ error: "לא ניתן להסיר הרשאות מעצמך" }, { status: 400 });
      }
      member = await updateMemberRole(id, role);
    }

    if (hasFlagUpdate) {
      member = await updateMemberFlags(id, { isAmember, firstPayout });
    }

    return NextResponse.json({ member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
