import { NextResponse } from "next/server";
import {
  requireAdmin,
  requireGemachAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import { closeGemachPermanently, getGemachById, getMemberById } from "@/lib/firestore/repository";

export async function POST(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const body = await request.json();
    const { gemachId: requestedGemachId, confirmName } = body as {
      gemachId?: string;
      confirmName?: string;
    };

    const gemachId = resolveGemachAdminScope(adminAuth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    if (!confirmName?.trim()) {
      return NextResponse.json({ error: "נדרש אישור בשם הגמ״ח" }, { status: 400 });
    }

    const existing = await getGemachById(gemachId);
    if (!existing) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }
    if (confirmName.trim() !== existing.name.trim()) {
      return NextResponse.json(
        { error: "שם האישור לא תואם לשם הגמ״ח" },
        { status: 400 }
      );
    }

    const result = await closeGemachPermanently(gemachId);
    const member = await getMemberById(adminAuth.uid);
    return NextResponse.json({ ...result, member });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
