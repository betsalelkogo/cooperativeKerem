import type { DevicePot, FundSplit, Tool } from "./types";

const DEFAULT_OPERATIONS_PERCENT = 18;

export function getOperationsPercent(): number {
  const envValue = process.env.OPERATIONS_POT_PERCENT;
  const parsed = envValue ? Number.parseInt(envValue, 10) : DEFAULT_OPERATIONS_PERCENT;
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    return DEFAULT_OPERATIONS_PERCENT;
  }
  return parsed;
}

export function splitPayment(amount: number, operationsPercent = getOperationsPercent()): FundSplit {
  const operationsAmount = Math.round((amount * operationsPercent) / 100);
  const deviceAmount = amount - operationsAmount;

  return {
    totalAmount: amount,
    operationsAmount,
    deviceAmount,
    operationsPercent,
  };
}

export function formatNIS(amount: number): string {
  return `₪${amount.toLocaleString("he-IL")}`;
}

/**
 * Format the cooperative's internal credit unit ("שֶׁכֵּלִים" — a pun on שקל + כלים).
 * 1 שכל = 1 ₪. Always uses the plural form per product decision.
 */
export function formatCredits(amount: number): string {
  return `${amount.toLocaleString("he-IL")} שֶׁכֵּלִים`;
}

export interface PotKindRow {
  kindId: string;
  name: string;
  category: string;
  /** Combined balance across all units of this kind (₪). */
  balance: number;
  /** Number of physical units sharing this kind. */
  units: number;
  loanFeeMin: number;
}

/** Aggregate per-unit device pots into one row per tool kind. */
export function groupPotsByKind(tools: Tool[], devicePots: DevicePot[]): PotKindRow[] {
  const balanceByTool = new Map<string, number>();
  for (const pot of devicePots) {
    const key = pot.toolId ?? (pot as { id?: string }).id;
    if (key) balanceByTool.set(key, (balanceByTool.get(key) ?? 0) + (pot.balance ?? 0));
  }

  const rows = new Map<string, PotKindRow>();
  for (const tool of tools) {
    const kindId = tool.kindId ?? tool.id;
    const balance = balanceByTool.get(tool.id) ?? 0;
    const existing = rows.get(kindId);
    if (existing) {
      existing.balance += balance;
      existing.units += 1;
    } else {
      rows.set(kindId, {
        kindId,
        name: tool.name,
        category: tool.category,
        balance,
        units: 1,
        loanFeeMin: tool.loanFeeMin,
      });
    }
  }

  return [...rows.values()];
}
