import type { Gemach, GemachPricingMode, GemachReservationMode, Tool } from "@/lib/types";
import { formatNIS } from "@/lib/pots";

export const PLATFORM_GEMACH_ID = "kerem";
export const PLATFORM_GEMACH_DISPLAY_NAME = "כרם רעים";
export const COOPERATIVE_FILTER_LABEL = "קואופרטיב";

export const PLATFORM_DEFAULT_LOAN_HOURS = 4;
export const PLATFORM_MAX_LOAN_HOURS = 24;
export const PARTNER_DEFAULT_LOAN_HOURS = 4;
export const PARTNER_MAX_LOAN_HOURS = 24;
export const MAX_LOAN_HOURS_CAP = 168;

export const LOAN_HOUR_CANDIDATES: number[] = [1, 2, 4, 6, 8, 12, 24, 48, 72, 168];

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

export function resolveGemachReservationMode(
  gemach: Pick<Gemach, "id" | "isPlatform" | "reservationMode">
): GemachReservationMode {
  if (isPlatformGemach(gemach)) return "fixed_hours";
  return gemach.reservationMode ?? "date_range";
}

export function resolveGemachDefaultLoanHours(gemach: Gemach): number {
  return gemach.defaultLoanHours ?? (isPlatformGemach(gemach) ? PLATFORM_DEFAULT_LOAN_HOURS : PARTNER_DEFAULT_LOAN_HOURS);
}

export function resolveGemachMaxLoanHours(gemach: Gemach): number {
  return gemach.maxLoanHours ?? (isPlatformGemach(gemach) ? PLATFORM_MAX_LOAN_HOURS : PARTNER_MAX_LOAN_HOURS);
}

export function resolveToolDefaultLoanHours(
  tool: Pick<Tool, "defaultLoanHours">,
  gemach: Gemach
): number {
  return tool.defaultLoanHours ?? resolveGemachDefaultLoanHours(gemach);
}

export function resolveToolMaxLoanHours(
  tool: Pick<Tool, "defaultLoanHours" | "maxLoanHours">,
  gemach: Gemach
): number {
  const minH = resolveToolDefaultLoanHours(tool, gemach);
  const maxH = tool.maxLoanHours ?? resolveGemachMaxLoanHours(gemach);
  return Math.max(minH, maxH);
}

export function loanHourOptionsForTool(
  tool: Pick<Tool, "defaultLoanHours" | "maxLoanHours">,
  gemach: Gemach
): number[] {
  const minH = resolveToolDefaultLoanHours(tool, gemach);
  const maxH = resolveToolMaxLoanHours(tool, gemach);
  const candidates = LOAN_HOUR_CANDIDATES.filter((h) => h >= minH && h <= maxH);
  if (!candidates.includes(minH)) candidates.unshift(minH);
  if (!candidates.includes(maxH)) candidates.push(maxH);
  return [...new Set(candidates)].sort((a, b) => a - b);
}

export function validateToolLoanHours(
  defaultLoanHours: number | undefined,
  maxLoanHours: number | undefined,
  gemach: Gemach
): string | null {
  const inheritedDefault = resolveGemachDefaultLoanHours(gemach);
  const inheritedMax = resolveGemachMaxLoanHours(gemach);

  if (defaultLoanHours !== undefined) {
    if (!Number.isFinite(defaultLoanHours) || defaultLoanHours < 1) {
      return "משך ברירת מחדל חייב להיות לפחות שעה אחת";
    }
    if (defaultLoanHours > MAX_LOAN_HOURS_CAP) {
      return `משך ברירת מחדל — מקסימום ${MAX_LOAN_HOURS_CAP} שעות`;
    }
  }

  if (maxLoanHours !== undefined) {
    if (!Number.isFinite(maxLoanHours) || maxLoanHours < 1) {
      return "משך מקסימלי חייב להיות לפחות שעה אחת";
    }
    if (maxLoanHours > MAX_LOAN_HOURS_CAP) {
      return `משך מקסימלי — עד ${MAX_LOAN_HOURS_CAP} שעות`;
    }
  }

  const resolvedDefault = defaultLoanHours ?? inheritedDefault;
  const resolvedMax = maxLoanHours ?? inheritedMax;
  if (resolvedMax < resolvedDefault) {
    return "משך מקסימלי חייב להיות לפחות כמו משך ברירת המחדל";
  }

  return null;
}

export function loanHourOptionsForGemach(gemach: Gemach): number[] {
  return loanHourOptionsForTool({}, gemach);
}

export const gemachReservationModeLabels: Record<GemachReservationMode, string> = {
  fixed_hours: "השאלה לפי שעות",
  date_range: "השאלה לפי תאריכים",
};

export const gemachReservationModeHints: Record<GemachReservationMode, string> = {
  fixed_hours:
    "השואל בוחר תאריך, שעת התחלה ומשך (ברירת מחדל 4 שעות, ניתן להאריך) — מתאים להשאלות קצרות.",
  date_range:
    "חלונות איסוף והחזרה נפרדים — מתאים להשאלות של יום שלם או יותר (גמ״ח תינוקות וכו׳).",
};
