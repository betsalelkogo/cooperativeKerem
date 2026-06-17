import { NextResponse } from "next/server";
import { markPaymentPaid } from "@/lib/firestore/repository";

/** Grow server-to-server webhook — extend when merchant credentials are configured. */
export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const paymentId = body.get("cField1") as string | null;
    const status = body.get("status") as string | null;

    if (paymentId && (status === "1" || status === "success")) {
      await markPaymentPaid(paymentId);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "webhook failed" }, { status: 500 });
  }
}
