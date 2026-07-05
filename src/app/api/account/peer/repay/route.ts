import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { repayPeerCreditDebt } from "@/lib/firestore/repository";

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = (await request.json()) as { lenderId?: string };
    const lenderId = typeof body.lenderId === "string" ? body.lenderId.trim() : "";
    if (!lenderId) {
      return NextResponse.json({ error: "חסר מזהה מלווה" }, { status: 400 });
    }

    const { repaid } = await repayPeerCreditDebt({ borrowerId: uid, lenderId });
    return NextResponse.json({ ok: true, repaid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    const status =
      message.includes("יתרה") || message.includes("חוב") || message.includes("תקינה")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
