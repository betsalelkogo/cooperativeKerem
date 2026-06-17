import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/admin-auth";
import { getAdminDashboard } from "@/lib/firestore/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const data = await getAdminDashboard();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
