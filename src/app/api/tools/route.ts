import { NextResponse } from "next/server";
import { getAllTools } from "@/lib/firestore/repository";

export async function GET() {
  try {
    const tools = await getAllTools();
    return NextResponse.json(tools);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
