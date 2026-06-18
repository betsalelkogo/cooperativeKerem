import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/firebase/admin-auth";
import {
  resolveMaintenanceTicket,
  getToolById,
  getMaintenanceTicketById,
  getGemachById,
} from "@/lib/firestore/repository";
import { canAdminGemach, isPlatformAdmin } from "@/lib/admin";
import { isPlatformGemach } from "@/lib/gemach";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { adminReply } = body as { adminReply?: string };

    const ticket = await getMaintenanceTicketById(id);
    if (!ticket) {
      return NextResponse.json({ error: "הדיווח לא נמצא" }, { status: 404 });
    }

    const tool = await getToolById(ticket.toolId);
    if (!tool) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    const gemach = await getGemachById(tool.gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }

    const platformOnlyCoop =
      isPlatformAdmin(auth.member) &&
      !isPlatformGemach(gemach) &&
      !auth.member.gemachAdminIds?.includes(tool.gemachId);

    if (!canAdminGemach(auth.member, tool.gemachId) || platformOnlyCoop) {
      return NextResponse.json({ error: "אין הרשאה לסגור דיווח זה" }, { status: 403 });
    }

    const resolved = await resolveMaintenanceTicket(id, {
      adminReply,
      resolvedBy: auth.uid,
    });

    return NextResponse.json(resolved);
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
