import type { Gemach, GemachPricingMode, Tool } from "@/lib/types";
import { formatNIS } from "@/lib/pots";

export const PLATFORM_GEMACH_ID = "kerem";
export const PLATFORM_GEMACH_DISPLAY_NAME = "כרם רעים";
export const COOPERATIVE_FILTER_LABEL = "קואופרטיב";

export function isPlatformGemach(gemach: Pick<Gemach, "id" | "isPlatform">): boolean {
  return gemach.isPlatform || gemach.id === PLATFORM_GEMACH_ID;
}

export function displayGemachName(gemach: Pick<Gemach, "id" | "name" | "isPlatform">): string {
  if (isPlatformGemach(gemach)) return PLATFORM_GEMACH_DISPLAY_NAME;
  return gemach.name;
}

export function gemachFilterLabel(gemach: Pick<Gemach, "id" | "name" | "isPlatform">): string {
  if (isPlatformGemach(gemach)) return COOPERATIVE_FILTER_LABEL;
  return gemach.name;
}

export function normalizeGemachId(value: unknown): string {
  return typeof value === "string" && value ? value : PLATFORM_GEMACH_ID;
}

export function resolveReservationFee(gemach: Gemach, tool: Tool): number {
  if (gemach.pricingMode === "free") return 0;
  if (gemach.pricingMode === "maintenance_only") {
    return gemach.maintenanceFee ?? 0;
  }
  return tool.loanFeeMin;
}

export function formatToolPriceLabel(
  gemach: Pick<Gemach, "pricingMode" | "maintenanceFee" | "isPlatform">,
  tool: Pick<Tool, "loanFeeMin" | "loanFeeMax">
): string {
  if (gemach.pricingMode === "free") return "חינם";
  if (gemach.pricingMode === "maintenance_only") {
    const fee = gemach.maintenanceFee ?? 0;
    return fee > 0 ? `${formatNIS(fee)} דמי תחזוקה` : "חינם";
  }
  if (tool.loanFeeMin === 0 && tool.loanFeeMax === 0) return "חינם";
  if (tool.loanFeeMin === tool.loanFeeMax) return formatNIS(tool.loanFeeMin);
  return `${formatNIS(tool.loanFeeMin)}–${formatNIS(tool.loanFeeMax)}`;
}

export function isPartnerGemach(gemach: Pick<Gemach, "isPlatform">): boolean {
  return !gemach.isPlatform;
}

export const gemachPricingModeLabels: Record<GemachPricingMode, string> = {
  free: "חינם",
  loan_fee: "דמי השאלה",
  maintenance_only: "דמי תחזוקה בלבד",
};

const RESERVED_GEMACH_IDS = new Set([PLATFORM_GEMACH_ID, "admin", "new"]);

export function slugifyGemachId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function generateGemachId(name?: string): string {
  const base = name ? slugifyGemachId(name) : "";
  const suffix = Date.now().toString(36);
  if (base && base.length >= 3 && !RESERVED_GEMACH_IDS.has(base)) {
    return `${base}-${suffix.slice(-4)}`;
  }
  return `gemach-${suffix}`;
}

export function validateGemachId(id: string): string | null {
  if (!id || id.length < 3 || id.length > 48) {
    return "מזהה הגמ״ח חייב להיות באורך 3–48 תווים";
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return "מזהה הגמ״ח: אותיות קטנות באנגלית, מספרים ומקף בלבד";
  }
  if (RESERVED_GEMACH_IDS.has(id)) {
    return "מזהה זה שמור למערכת";
  }
  return null;
}

export function validateGemachName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "שם הגמ״ח קצר מדי";
  if (trimmed.length > 80) return "שם הגמ״ח ארוך מדי";
  return null;
}

export function validatePayboxGroupUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "נדרש קישור PayBox";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return "יש להזין כתובת HTTPS בלבד";
    }
    return null;
  } catch {
    return "כתובת PayBox לא תקינה";
  }
}

export function gemachRequiresPaybox(pricingMode: GemachPricingMode): boolean {
  return pricingMode === "loan_fee" || pricingMode === "maintenance_only";
}
