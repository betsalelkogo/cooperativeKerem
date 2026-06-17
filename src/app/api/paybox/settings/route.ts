import { NextResponse } from "next/server";
import { getPayboxSettings } from "@/lib/firestore/repository";

export async function GET() {
  try {
    const settings = await getPayboxSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
