import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  getMemberById,
  getMemberCreditLedger,
  getReservationById,
  getToolById,
} from "@/lib/firestore/repository";

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const [member, ledger] = await Promise.all([
      getMemberById(uid),
      getMemberCreditLedger(uid, 200),
    ]);

    // Resolve the tool name behind each loan-payment entry so the statement is
    // readable ("תשלום עבור מקדחה") rather than showing a raw reservation id.
    const reservationIds = [
      ...new Set(ledger.map((e) => e.reservationId).filter(Boolean) as string[]),
    ];
    const toolNames = new Map<string, string>();
    await Promise.all(
      reservationIds.map(async (rid) => {
        const reservation = await getReservationById(rid);
        if (!reservation) return;
        const tool = await getToolById(reservation.toolId);
        if (tool?.name) toolNames.set(rid, tool.name);
      })
    );

    const entries = ledger.map((entry) => ({
      ...entry,
      toolName: entry.reservationId ? toolNames.get(entry.reservationId) : undefined,
    }));

    return NextResponse.json({ balance: member?.creditBalance ?? 0, entries });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
