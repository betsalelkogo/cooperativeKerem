import { NextResponse } from "next/server";
import {
  requireAdmin,
  requireGemachAdmin,
  resolveGemachAdminScope,
} from "@/lib/firebase/admin-auth";
import { updateGemachSettings, getGemachById } from "@/lib/firestore/repository";
import {
  gemachRequiresPaybox,
  validateGemachName,
  validatePayboxGroupUrl,
} from "@/lib/gemach";
import type { GemachPricingMode, GemachReservationMode } from "@/lib/types";

const PRICING_MODES: GemachPricingMode[] = ["free", "loan_fee", "maintenance_only"];

export async function PATCH(request: Request) {
  const adminAuth = await requireAdmin(request);
  if (adminAuth instanceof NextResponse) return adminAuth;

  try {
    const body = await request.json();
    const {
      gemachId: requestedGemachId,
      payboxGroupUrl,
      name,
      description,
      cooperativeFee,
      location,
      pricingMode,
      reservationMode,
      maintenanceFee,
    } = body as {
      gemachId?: string;
      payboxGroupUrl?: string | null;
      name?: string;
      description?: string;
      cooperativeFee?: number | null;
      location?: string | null;
      pricingMode?: GemachPricingMode;
      reservationMode?: GemachReservationMode;
      maintenanceFee?: number | null;
    };

    const gemachId = resolveGemachAdminScope(adminAuth.member, requestedGemachId ?? null);
    if (gemachId instanceof NextResponse) return gemachId;

    const scoped = await requireGemachAdmin(request, gemachId);
    if (scoped instanceof NextResponse) return scoped;

    const existing = await getGemachById(gemachId);
    if (!existing?.active) {
      return NextResponse.json({ error: "הגמ״ח סגור" }, { status: 403 });
    }

    if (name !== undefined) {
      const nameError = validateGemachName(name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
    }

    if (pricingMode !== undefined && !PRICING_MODES.includes(pricingMode)) {
      return NextResponse.json({ error: "מודל תמחור לא תקין" }, { status: 400 });
    }

    if (
      reservationMode !== undefined &&
      reservationMode !== "fixed_hours" &&
      reservationMode !== "date_range"
    ) {
      return NextResponse.json({ error: "מודל שמירה לא תקין" }, { status: 400 });
    }

    const resolvedPricingMode = pricingMode ?? existing.pricingMode;

    if (resolvedPricingMode === "maintenance_only") {
      const fee =
        maintenanceFee !== undefined
          ? Number(maintenanceFee)
          : (existing.maintenanceFee ?? 0);
      if (!Number.isFinite(fee) || fee < 0) {
        return NextResponse.json(
          { error: "דמי תחזוקה חייבים להיות מספר חיובי" },
          { status: 400 }
        );
      }
    }

    if (payboxGroupUrl) {
      const payboxError = validatePayboxGroupUrl(payboxGroupUrl);
      if (payboxError) {
        return NextResponse.json({ error: payboxError }, { status: 400 });
      }
    }

    const resolvedCoopFee =
      resolvedPricingMode !== "free"
        ? 0
        : cooperativeFee === null
          ? 0
          : cooperativeFee !== undefined
            ? Math.max(0, Number(cooperativeFee) || 0)
            : (existing.cooperativeFee ?? 0);

    const resolvedPaybox =
      payboxGroupUrl !== undefined
        ? payboxGroupUrl?.trim() || ""
        : (existing.payboxGroupUrl ?? "");

    if (gemachRequiresPaybox(resolvedPricingMode) && !resolvedPaybox) {
      return NextResponse.json(
        { error: "נדרש קישור PayBox לתשלומים" },
        { status: 400 }
      );
    }

    if (resolvedPricingMode === "free" && resolvedCoopFee > 0 && !resolvedPaybox) {
      return NextResponse.json(
        { error: "גמ״ח חינמי עם דמי קואופרטיב דורש קישור PayBox" },
        { status: 400 }
      );
    }

    const gemach = await updateGemachSettings({
      gemachId,
      payboxGroupUrl,
      name,
      description,
      cooperativeFee: resolvedPricingMode === "free" ? cooperativeFee : null,
      location,
      pricingMode,
      reservationMode,
      maintenanceFee:
        resolvedPricingMode === "maintenance_only"
          ? maintenanceFee !== undefined
            ? Number(maintenanceFee)
            : existing.maintenanceFee
          : null,
    });

    return NextResponse.json({ gemach });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
