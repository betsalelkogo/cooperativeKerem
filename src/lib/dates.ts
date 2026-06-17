/** Normalize reservation pickup from new or legacy Firestore fields. */
export function reservationPickupDate(data: {
  pickupDate?: unknown;
  date?: unknown;
}): string {
  if (typeof data.pickupDate === "string" && data.pickupDate) return data.pickupDate;
  if (typeof data.date === "string" && data.date) return data.date;
  return "";
}

export function reservationReturnDate(data: { returnDate?: unknown }): string {
  return typeof data.returnDate === "string" ? data.returnDate : "";
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function daysUntil(dateStr: string, from = new Date()): number {
  if (!dateStr) return NaN;
  const target = parseDateOnly(dateStr);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - start.getTime()) / 86_400_000);
}

export function formatAvailableFromLabel(returnDate: string): string | undefined {
  if (!returnDate) return undefined;
  const days = daysUntil(returnDate);
  if (Number.isNaN(days)) return undefined;
  if (days <= 0) return "זמין היום";
  if (days === 1) return "זמין מחר";
  return `זמין בעוד ${days} ימים`;
}

export function formatDateHe(iso?: string, withTime = false) {
  if (!iso) return "—";
  const hasTime = iso.includes("T");
  const date = hasTime ? new Date(iso) : parseDateOnly(iso);
  return date.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    ...(withTime || hasTime
      ? { hour: "2-digit", minute: "2-digit" }
      : {}),
  });
}
