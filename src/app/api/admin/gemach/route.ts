import { NextResponse } from "next/server";
import {
  requireAdmin,
  requireGemachAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import { updateGemachSettings, getGemachById } from "@/lib/firestore/repository";
import { validatePayboxGroupUrl } from "@/lib/gemach";

export async function PATCH(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const body = await request.json();
    const {
      gemachId: requestedGemachId,
      payboxGroupUrl,
      name,
      description,
    } = body as {
      gemachId?: string;
      payboxGroupUrl?: string | null;
      name?: string;
      description?: string;
    };

    const gemachId = resolveGemachAdminScope(adminAuth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    const existing = await getGemachById(gemachId);
    if (!existing?.active) {
      return NextResponse.json({ error: "הגמ״ח סגור" }, { status: 403 });
    }

    if (payboxGroupUrl) {
      const payboxError = validatePayboxGroupUrl(payboxGroupUrl);
      if (payboxError) {
        return NextResponse.json({ error: payboxError }, { status: 400 });
      }
    }

    const gemach = await updateGemachSettings({
      gemachId,
      payboxGroupUrl,
      name,
      description,
    });

    return NextResponse.json({ gemach });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
