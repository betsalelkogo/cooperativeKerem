import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/admin-auth";
import { isGemachScopedAdmin } from "@/lib/admin";
import { getGemachById } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  if (!isGemachScopedAdmin(auth.member)) {
    return NextResponse.json({ error: "גישה למנהלי גמ״ח בלבד" }, { status: 403 });
  }

  const ids = auth.member.gemachAdminIds ?? [];
  const gemachim = (
    await Promise.all(ids.map((id) => getGemachById(id)))
  ).filter((g): g is NonNullable<typeof g> => g !== null && g.active);

  return NextResponse.json({ gemachim });
}
