import type { Gemach, SafetyRule } from "@/lib/types";
import { slugifyGemachId } from "@/lib/gemach";

export const TOOL_CATEGORIES = [
  "כלי עבודה חשמליים",
  "ניקוי",
  "גישה",
  "תינוקות וילדים",
  "גינון",
  "אחר",
] as const;

export const DEFAULT_SAFETY_RULES: SafetyRule[] = [
  { id: "sr-default-1", text: "קראתי את הוראות השימוש" },
  { id: "sr-default-2", text: "אשתמש בכלי בזהירות ואחזיר אותו במצב תקין" },
];

export function kindIdForTool(gemachId: string, name: string, explicit?: string): string {
  if (explicit?.trim()) return slugifyGemachId(explicit) || explicit.trim();
  const slug = slugifyGemachId(name);
  return slug ? `${gemachId}-${slug}` : `${gemachId}-kind-${Date.now().toString(36)}`;
}

export function qrCodeForUnit(gemachId: string, kindId: string, unitIndex: number): string {
  const suffix = kindId.replace(/[^a-z0-9]/gi, "-").toUpperCase();
  return `${gemachId.toUpperCase()}-${suffix}-${unitIndex + 1}`;
}

export function resolveToolFees(
  gemach: Pick<Gemach, "pricingMode">,
  loanFeeMin: number,
  loanFeeMax: number
): { loanFeeMin: number; loanFeeMax: number } {
  if (gemach.pricingMode === "free") {
    return { loanFeeMin: 0, loanFeeMax: 0 };
  }
  return {
    loanFeeMin: Math.max(0, loanFeeMin),
    loanFeeMax: Math.max(Math.max(0, loanFeeMin), loanFeeMax),
  };
}

export function validateToolInput(params: {
  name?: string;
  description?: string;
  category?: string;
  quantity?: number;
}): string | null {
  if (!params.name?.trim() || params.name.trim().length < 2) {
    return "שם הכלי קצר מדי";
  }
  if (!params.description?.trim()) {
    return "נדרש תיאור קצר";
  }
  if (!params.category?.trim()) {
    return "יש לבחור קטגוריה";
  }
  const qty = Number(params.quantity);
  if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
    return "כמות יחידות חייבת להיות בין 1 ל-50";
  }
  return null;
}
