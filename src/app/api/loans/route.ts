import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  canExtendActiveLoan,
  getLoansByMember,
  getToolById,
} from "@/lib/firestore/repository";

export async function GET(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const loans = await getLoansByMember(memberId);
    const withTools = await Promise.all(
      loans.map(async (loan) => {
        const [tool, extend] = await Promise.all([
          getToolById(loan.toolId),
          canExtendActiveLoan(loan),
        ]);
        return {
          loan,
          tool,
          canExtend: extend.canExtend,
          extendFee: extend.extendFee ?? 0,
        };
      })
    );

    return NextResponse.json(withTools);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
