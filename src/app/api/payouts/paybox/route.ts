import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  completePayboxPayout,
  createPayboxPayout,
  getPayboxPayouts,
  getPayboxSettings,
} from "@/lib/firestore/repository";
import { resolvePayboxGroupUrl } from "@/lib/paybox/config";

export async function GET() {
  try {
    const payouts = await getPayboxPayouts();
    return NextResponse.json(payouts);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const { potTarget, toolId, amount, note } = body as {
      potTarget?: "operations" | "device";
      toolId?: string;
      amount?: number;
      note?: string;
    };

    if (!potTarget || !amount) {
      return NextResponse.json({ error: "חסרים שדות חובה" }, { status: 400 });
    }

    const settings = await getPayboxSettings();
    if (!settings.enabled) {
      return NextResponse.json({ error: "PayBox לא מוגדר" }, { status: 503 });
    }

    const groupUrl = resolvePayboxGroupUrl(settings, potTarget);
    if (!groupUrl) {
      return NextResponse.json({ error: "חסר קישור לקבוצת PayBox" }, { status: 503 });
    }

    const payout = await createPayboxPayout({
      potTarget,
      toolId,
      amount,
      groupUrl,
      note,
      createdBy: memberId,
    });

    return NextResponse.json(payout, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
