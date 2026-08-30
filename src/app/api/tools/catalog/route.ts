import { NextResponse } from "next/server";
import { getToolKindsWithAvailability } from "@/lib/firestore/repository";

export async function GET() {
  try {
    const kinds = await getToolKindsWithAvailability();
    return NextResponse.json(kinds);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
