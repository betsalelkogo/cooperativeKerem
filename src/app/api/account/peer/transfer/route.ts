import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { transferCreditToMember } from "@/lib/firestore/repository";

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = (await request.json()) as { toMemberId?: string; amount?: number };
    const toMemberId = typeof body.toMemberId === "string" ? body.toMemberId.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);

    if (!toMemberId) {
      return NextResponse.json({ error: "יש לבחור למי להעביר" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "סכום ההעברה אינו תקין" }, { status: 400 });
    }

    const { loan } = await transferCreditToMember({
      fromMemberId: uid,
      toMemberId,
      amount,
    });

    return NextResponse.json({ ok: true, loan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    const status = message.includes("יתרה") || message.includes("לעצמכם") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
