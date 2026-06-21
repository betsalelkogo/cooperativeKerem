import type { Reservation } from "@/lib/types";
import { reservationDateTime } from "@/lib/israel-time";
import { parseTimeToMinutes } from "@/lib/reservation-times";

export function getLateFeePerHour(): number {
  const raw = process.env.LATE_FEE_PER_HOUR;
  const parsed = raw ? Number(raw) : 15;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 15;
}

/** Scheduled return moment from reservation (end of return window). */
export function scheduledReturnAt(reservation: Pick<
  Reservation,
  "returnDate" | "returnTimeEnd" | "returnTimeStart"
>): Date {
  const time = reservation.returnTimeEnd ?? reservation.returnTimeStart ?? "23:59";
  return reservationDateTime(reservation.returnDate, time);
}

export function computeLateness(
  reservation: Pick<Reservation, "returnDate" | "returnTimeEnd" | "returnTimeStart">,
  returnedAt: Date
): { lateMinutes: number; dueAt: Date } {
  const dueAt = scheduledReturnAt(reservation);
  const lateMs = returnedAt.getTime() - dueAt.getTime();
  const lateMinutes = lateMs > 0 ? Math.ceil(lateMs / 60_000) : 0;
  return { lateMinutes, dueAt };
}

export function calculateLateFeeAmount(lateMinutes: number): number {
  if (lateMinutes <= 0) return 0;
  const hours = Math.ceil(lateMinutes / 60);
  return hours * getLateFeePerHour();
}

export function formatLateDuration(lateMinutes: number): string {
  if (lateMinutes <= 0) return "";
  const hours = Math.floor(lateMinutes / 60);
  const mins = lateMinutes % 60;
  if (hours === 0) return `${mins} דקות`;
  if (mins === 0) return hours === 1 ? "שעה אחת" : `${hours} שעות`;
  return `${hours === 1 ? "שעה" : `${hours} שעות`} ו-${mins} דקות`;
}
