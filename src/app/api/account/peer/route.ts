import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getPeerCreditSummary, listMemberDirectory } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const [summary, members] = await Promise.all([
      getPeerCreditSummary(uid),
      listMemberDirectory(uid),
    ]);

    return NextResponse.json({ owed: summary.owed, lent: summary.lent, members });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
