import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getMemberById } from "@/lib/firestore/repository";
import {
  canAdminGemach,
  isAdminMember,
  isBoardMember,
  isDisputeResolver,
  isGemachAdmin,
  isPlatformAdmin,
} from "@/lib/admin";
import type { Member } from "@/lib/types";

async function requireAuthenticatedMember(
  request: Request
): Promise<{ uid: string; member: Member } | NextResponse> {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
  }

  const member = await getMemberById(uid);
  if (!member) {
    return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 });
  }

  return { uid, member };
}

export async function requireAdmin(
  request: Request
): Promise<{ uid: string; member: Member } | NextResponse> {
  const auth = await requireAuthenticatedMember(request);
  if (auth instanceof NextResponse) return auth;

  if (!isAdminMember(auth.member)) {
    return NextResponse.json({ error: "גישה למנהלים בלבד" }, { status: 403 });
  }

  return auth;
}

export async function requirePlatformAdmin(
  request: Request
): Promise<{ uid: string; member: Member } | NextResponse> {
  const auth = await requireAuthenticatedMember(request);
  if (auth instanceof NextResponse) return auth;

  if (!isPlatformAdmin(auth.member)) {
    return NextResponse.json({ error: "גישה למנהל פלטפורמה בלבד" }, { status: 403 });
  }

  return auth;
}

export async function requireDisputeViewer(
  request: Request
): Promise<{ uid: string; member: Member } | NextResponse> {
  const auth = await requireAuthenticatedMember(request);
  if (auth instanceof NextResponse) return auth;

  if (
    !isPlatformAdmin(auth.member) &&
    !isBoardMember(auth.member) &&
    !isDisputeResolver(auth.member)
  ) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  return auth;
}

export async function requireGemachAdmin(
  request: Request,
  gemachId: string
): Promise<{ uid: string; member: Member } | NextResponse> {
  const auth = await requireAuthenticatedMember(request);
  if (auth instanceof NextResponse) return auth;

  if (!canAdminGemach(auth.member, gemachId)) {
    return NextResponse.json({ error: "אין הרשאה לגמ״ח זה" }, { status: 403 });
  }

  return auth;
}

export function resolveGemachAdminScope(
  member: Member,
  requestedGemachId?: string | null
): string | NextResponse {
  if (isPlatformAdmin(member) && requestedGemachId) {
    return requestedGemachId;
  }

  if (isGemachAdmin(member)) {
    const ids = member.gemachAdminIds ?? [];
    if (requestedGemachId) {
      if (!ids.includes(requestedGemachId)) {
        return NextResponse.json({ error: "אין הרשאה לגמ״ח זה" }, { status: 403 });
      }
      return requestedGemachId;
    }
    if (ids.length === 1) return ids[0];
    if (ids.length > 1) {
      return NextResponse.json(
        { error: "נדרש מזהה גמ״ח", gemachIds: ids },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "גישה למנהלי גמ״ח בלבד" }, { status: 403 });
}
