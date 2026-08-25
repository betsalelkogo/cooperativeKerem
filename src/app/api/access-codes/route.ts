import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getAccessCodes, getMemberById } from "@/lib/firestore/repository";
import { isPaidMember } from "@/lib/membership";
import { isBoardMember } from "@/lib/admin";
import type { AccessCodesPublicView } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const member = await getMemberById(uid);
    if (!member) {
      return NextResponse.json({ error: "משתמש לא נמצא" }, { status: 403 });
    }

    const publicOnly =
      new URL(request.url).searchParams.get("scope") === "caravan";
    const codes = await getAccessCodes();
    const clubRoomVisible =
      (isPaidMember(member) || isBoardMember(member)) && !publicOnly;

    const body: AccessCodesPublicView = {
      caravanCode: codes.caravanCode || null,
      caravanNote: codes.caravanNote || null,
      clubRoomVisible,
      clubRoomCode: clubRoomVisible && codes.clubRoomCode ? codes.clubRoomCode : null,
      clubRoomNote: clubRoomVisible ? codes.clubRoomNote || null : null,
      clubRoomUpdatedAt: clubRoomVisible ? codes.clubRoomUpdatedAt : null,
    };

    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
