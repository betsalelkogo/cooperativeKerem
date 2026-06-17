import { NextResponse } from "next/server";
import { getToolKindWithAvailability } from "@/lib/firestore/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const kind = await getToolKindWithAvailability(id);
    if (!kind) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }
    return NextResponse.json(kind);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
