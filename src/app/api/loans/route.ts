import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { getLoansByMember, getToolById } from "@/lib/firestore/repository";

export async function GET(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const loans = await getLoansByMember(memberId);
    const withTools = await Promise.all(
      loans.map(async (loan) => ({
        loan,
        tool: await getToolById(loan.toolId),
      }))
    );

    return NextResponse.json(withTools);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
