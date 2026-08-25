import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/admin-auth";
import { isBoardMember } from "@/lib/admin";
import { getAccessCodes, updateAccessCodes } from "@/lib/firestore/repository";
import {
  normalizeAccessCode,
  normalizeAccessNote,
  validateAccessCode,
} from "@/lib/access-codes";

async function requireBoard(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  if (!isBoardMember(auth.member)) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }
  return auth;
}

export async function GET(request: Request) {
  const auth = await requireBoard(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const codes = await getAccessCodes();
    return NextResponse.json(codes);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireBoard(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await request.json()) as {
      caravanCode?: unknown;
      caravanNote?: unknown;
      clubRoomCode?: unknown;
      clubRoomNote?: unknown;
    };

    const caravanCode = normalizeAccessCode(body.caravanCode);
    const clubRoomCode = normalizeAccessCode(body.clubRoomCode);
    const caravanNote = normalizeAccessNote(body.caravanNote);
    const clubRoomNote = normalizeAccessNote(body.clubRoomNote);

    const caravanError = validateAccessCode(caravanCode);
    if (caravanError) {
      return NextResponse.json({ error: `קוד קרוואן: ${caravanError}` }, { status: 400 });
    }
    const roomError = validateAccessCode(clubRoomCode);
    if (roomError) {
      return NextResponse.json({ error: `קוד חדר: ${roomError}` }, { status: 400 });
    }

    const codes = await updateAccessCodes({
      caravanCode,
      caravanNote,
      clubRoomCode,
      clubRoomNote,
    });
    return NextResponse.json(codes);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
