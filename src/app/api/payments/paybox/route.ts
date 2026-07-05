import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createMemberPayment,
  getPendingPaymentForReservation,
  getPaidPaymentForReservation,
  getPayboxSettings,
  getReservationById,
  getToolById,
  getGemachById,
  markPaymentPaid,
  getAdminDb,
} from "@/lib/firestore/repository";
import type { MemberPayment } from "@/lib/types";
import { createGrowPaymentLink } from "@/lib/paybox/grow";
import { isGrowConfigured } from "@/lib/paybox/config";
import { partnerUsesOwnPaybox, resolveCheckoutPayboxUrl } from "@/lib/paybox/gemach-paybox";
import { isPlatformGemach } from "@/lib/gemach";

export async function GET(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const reservationId = new URL(request.url).searchParams.get("reservationId");
    if (!reservationId) {
      return NextResponse.json({ error: "חסר מזהה שריון" }, { status: 400 });
    }

    const payment = await getPaidPaymentForReservation(reservationId);
    if (payment) {
      return NextResponse.json({ paid: true, payment });
    }

    const pending = await getPendingPaymentForReservation(reservationId);
    return NextResponse.json({ paid: false, payment: pending });
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
    const { reservationId, action, paymentId, fullName, phone } = body as {
      reservationId?: string;
      action?: "create" | "confirm";
      paymentId?: string;
      fullName?: string;
      phone?: string;
    };

    if (action === "confirm") {
      if (!paymentId) {
        return NextResponse.json({ error: "חסר מזהה תשלום" }, { status: 400 });
      }

      const payment = await markPaymentPaid(paymentId);
      if (payment.memberId !== memberId) {
        return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
      }

      return NextResponse.json(payment);
    }

    if (!reservationId) {
      return NextResponse.json({ error: "חסר מזהה שריון" }, { status: 400 });
    }

    const reservation = await getReservationById(reservationId);
    if (!reservation) {
      return NextResponse.json({ error: "השריון לא נמצא" }, { status: 404 });
    }
    if (reservation.memberId !== memberId) {
      return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
    }

    const existing = await getPaidPaymentForReservation(reservationId);
    if (existing) {
      return NextResponse.json(existing);
    }

    const settings = await getPayboxSettings();
    const tool = await getToolById(reservation.toolId);
    if (!tool) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    const gemach = await getGemachById(tool.gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }

    // The cooperative accepts internal balance only — PayBox is disabled there.
    if (isPlatformGemach(gemach)) {
      return NextResponse.json(
        { error: "בקואופרטיב התשלום מתבצע מהיתרה בלבד" },
        { status: 400 }
      );
    }

    const payboxResolved = resolveCheckoutPayboxUrl(gemach, settings);
    if ("error" in payboxResolved) {
      return NextResponse.json({ error: payboxResolved.error }, { status: 503 });
    }

    const groupUrl = payboxResolved.url;
    let growPaymentUrl: string | undefined;
    let provider: "paybox_group" | "grow" = "paybox_group";

    // A member may have already applied internal balance to this reservation.
    // Reuse that pending payment and only charge the uncovered remainder.
    const pending = await getPendingPaymentForReservation(reservationId);
    const creditApplied = pending?.creditApplied ?? 0;
    const remaining = Math.max(0, reservation.feeAmount - creditApplied);

    if (remaining <= 0) {
      const settled = pending
        ? await markPaymentPaid(pending.id)
        : await getPaidPaymentForReservation(reservationId);
      return NextResponse.json(settled);
    }

    let payment: MemberPayment;
    if (pending) {
      await getAdminDb()
        .collection("payments")
        .doc(pending.id)
        .update({ payboxGroupUrl: groupUrl, provider });
      payment = { ...pending, payboxGroupUrl: groupUrl, provider };
    } else {
      payment = await createMemberPayment({
        reservation,
        payboxGroupUrl: groupUrl,
        provider,
      });
    }

    const useGrow =
      !partnerUsesOwnPaybox(gemach) && isGrowConfigured() && fullName && phone;

    if (useGrow) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const grow = await createGrowPaymentLink({
        amount: remaining,
        title: `דמי השאלה — ${tool?.name ?? "כלי"}`,
        productName: tool?.name ?? "השאלת כלי",
        fullName,
        phone,
        successUrl: `${appUrl}/checkout/${reservationId}?payment=success`,
        notifyUrl: `${appUrl}/api/payments/paybox/webhook`,
        cField1: payment.id,
        cField2: reservationId,
      });
      growPaymentUrl = grow?.paymentUrl;
      provider = "grow";

      await getAdminDb().collection("payments").doc(payment.id).update({
        growPaymentUrl,
        provider,
      });
      payment.growPaymentUrl = growPaymentUrl;
      payment.provider = provider;
    }

    return NextResponse.json(payment, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
