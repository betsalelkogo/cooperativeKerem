import { NextResponse } from "next/server";
import {
  requireAdmin,
  requireGemachAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import { updateToolKindStatus, updateToolStatusScoped } from "@/lib/firestore/repository";

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { gemachId: requestedGemachId, kindId, toolId, status } = body as {
      gemachId?: string;
      kindId?: string;
      toolId?: string;
      status?: "available" | "disabled" | "maintenance";
    };

    if (!status || !["available", "disabled", "maintenance"].includes(status)) {
      return NextResponse.json({ error: "סטטוס לא תקין" }, { status: 400 });
    }

    const gemachId = resolveGemachAdminScope(auth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    if (toolId) {
      await updateToolStatusScoped({ toolId, status, gemachId });
      return NextResponse.json({ ok: true });
    }

    if (!kindId) {
      return NextResponse.json({ error: "נדרש מזהה כלי" }, { status: 400 });
    }

    const result = await updateToolKindStatus({ gemachId, kindId, status });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
