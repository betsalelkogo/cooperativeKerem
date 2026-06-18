import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import { listMembers } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? searchParams.get("email") ?? "";

  try {
    const members = await listMembers(query || undefined);
    return NextResponse.json(members);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
