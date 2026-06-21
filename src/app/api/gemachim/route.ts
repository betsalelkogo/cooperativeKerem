import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import { createGemachAndAssignAdmin } from "@/lib/firestore/repository";
import {
  generateGemachId,
  slugifyGemachId,
  validateGemachId,
  validateGemachName,
  validatePayboxGroupUrl,
  gemachRequiresPaybox,
} from "@/lib/gemach";
import type { GemachPricingMode, GemachReservationMode } from "@/lib/types";

const PRICING_MODES: GemachPricingMode[] = ["free", "loan_fee", "maintenance_only"];

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      pricingMode,
      reservationMode,
      maintenanceFee,
      slug,
      payboxGroupUrl,
      location,
      cooperativeFee,
    } = body as {
      name?: string;
      description?: string;
      pricingMode?: GemachPricingMode;
      reservationMode?: GemachReservationMode;
      maintenanceFee?: number;
      slug?: string;
      payboxGroupUrl?: string;
      location?: string;
      cooperativeFee?: number;
    };

    const nameError = validateGemachName(name ?? "");
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    if (!pricingMode || !PRICING_MODES.includes(pricingMode)) {
      return NextResponse.json({ error: "יש לבחור מודל תמחור" }, { status: 400 });
    }

    let gemachId = slug?.trim() ? slugifyGemachId(slug) : generateGemachId(name);
    const idError = validateGemachId(gemachId);
    if (idError) {
      return NextResponse.json({ error: idError }, { status: 400 });
    }

    if (pricingMode === "maintenance_only") {
      const fee = Number(maintenanceFee);
      if (!Number.isFinite(fee) || fee < 0) {
        return NextResponse.json({ error: "דמי תחזוקה חייבים להיות מספר חיובי" }, { status: 400 });
      }
    }

    const payboxTrimmed = payboxGroupUrl?.trim() ?? "";

    if (gemachRequiresPaybox(pricingMode)) {
      const payboxError = validatePayboxGroupUrl(payboxTrimmed);
      if (payboxError) {
        return NextResponse.json({ error: payboxError }, { status: 400 });
      }
    } else if (payboxTrimmed) {
      const payboxError = validatePayboxGroupUrl(payboxTrimmed);
      if (payboxError) {
        return NextResponse.json({ error: payboxError }, { status: 400 });
      }
    }

    const coopFee =
      pricingMode === "free" && cooperativeFee !== undefined
        ? Math.max(0, Number(cooperativeFee) || 0)
        : undefined;

    if (coopFee && coopFee > 0 && pricingMode === "free" && !payboxTrimmed) {
      return NextResponse.json(
        { error: "גמ״ח חינמי עם דמי קואופרטיב דורש קישור PayBox לתשלום" },
        { status: 400 }
      );
    }

    if (reservationMode && reservationMode !== "fixed_hours" && reservationMode !== "date_range") {
      return NextResponse.json({ error: "מודל שמירה לא תקין" }, { status: 400 });
    }

    const { gemach, member } = await createGemachAndAssignAdmin({
      id: gemachId,
      name: name!.trim(),
      description: description?.trim(),
      pricingMode,
      reservationMode: reservationMode ?? "date_range",
      maintenanceFee:
        pricingMode === "maintenance_only" ? Number(maintenanceFee ?? 0) : undefined,
      payboxGroupUrl: payboxTrimmed || undefined,
      location: location?.trim() || undefined,
      cooperativeFee: coopFee,
      createdBy: uid,
    });

    return NextResponse.json({ gemach, member }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    const status = message.includes("כבר קיים") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
