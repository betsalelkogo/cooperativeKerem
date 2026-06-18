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
import type { GemachPricingMode } from "@/lib/types";

const PRICING_MODES: GemachPricingMode[] = ["free", "loan_fee", "maintenance_only"];

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, pricingMode, maintenanceFee, slug, payboxGroupUrl } = body as {
      name?: string;
      description?: string;
      pricingMode?: GemachPricingMode;
      maintenanceFee?: number;
      slug?: string;
      payboxGroupUrl?: string;
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

    if (gemachRequiresPaybox(pricingMode)) {
      const payboxError = validatePayboxGroupUrl(payboxGroupUrl ?? "");
      if (payboxError) {
        return NextResponse.json({ error: payboxError }, { status: 400 });
      }
    }

    const { gemach, member } = await createGemachAndAssignAdmin({
      id: gemachId,
      name: name!.trim(),
      description: description?.trim(),
      pricingMode,
      maintenanceFee:
        pricingMode === "maintenance_only" ? Number(maintenanceFee ?? 0) : undefined,
      payboxGroupUrl:
        gemachRequiresPaybox(pricingMode) && payboxGroupUrl
          ? payboxGroupUrl.trim()
          : undefined,
      createdBy: uid,
    });

    return NextResponse.json({ gemach, member }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    const status = message.includes("כבר קיים") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
