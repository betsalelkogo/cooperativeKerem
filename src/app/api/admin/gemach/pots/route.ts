import { NextResponse } from "next/server";
import {
  requireAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import {
  getPotsOverviewForGemach,
  getGemachById,
} from "@/lib/firestore/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const gemachId = resolveGemachAdminScope(auth.member, searchParams.get("gemachId"));
  if (gemachId instanceof NextResponse) return gemachId;

  try {
    const [overview, gemach] = await Promise.all([
      getPotsOverviewForGemach(gemachId),
      getGemachById(gemachId),
    ]);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ...overview, gemach });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
