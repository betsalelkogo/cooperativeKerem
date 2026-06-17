import type { FundSplit } from "./types";

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
