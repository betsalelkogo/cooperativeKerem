import { NextResponse } from "next/server";
import { getPotsOverview } from "@/lib/firestore/repository";

export async function GET() {
  try {
    const data = await getPotsOverview();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
