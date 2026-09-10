import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/firebase/admin-auth";
import {
  getDefaultReturnInstructions,
  updateDefaultReturnInstructions,
} from "@/lib/firestore/repository";
import { sanitizeSafetyRules } from "@/lib/tools-admin";

export async function GET(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const rules = await getDefaultReturnInstructions();
    return NextResponse.json({ rules });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const rules = sanitizeSafetyRules(body?.rules) ?? [];
    const saved = await updateDefaultReturnInstructions(rules);
    return NextResponse.json({ rules: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
