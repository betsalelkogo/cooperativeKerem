import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/admin-auth";
import { isBoardMember } from "@/lib/admin";
import { getBoardDashboardData } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  if (!isBoardMember(auth.member)) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  try {
    const data = await getBoardDashboardData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
