import { formatReservationDateTimeHe, israelNowParts, reservationDateTime } from "@/lib/israel-time";
import {
  minutesToTime,
  parseTimeToMinutes,
  PICKUP_GRACE_MINUTES,
  type ReservationSchedule,
} from "@/lib/reservation-times";

/** Billing day closes at 22:00 Israel time. */
export const BILLING_DAY_END_HOUR = 22;
export const BILLING_DAY_END_TIME = "22:00";
export const MAX_RESERVATION_BILLING_DAYS = 3;

/** Shift a YYYY-MM-DD calendar date. Do not convert through timezone instants. */
function addDaysToDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateStr;
  }
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Next 22:00 close at or after `from`. Exactly 22:00 counts as this window's close. */
export function nextBillingClose(from = new Date()): { date: string; time: string } {
  const { date, minutes } = israelNowParts(from);
  if (minutes <= BILLING_DAY_END_HOUR * 60) {
    return { date, time: BILLING_DAY_END_TIME };
  }
  return { date: addDaysToDate(date, 1), time: BILLING_DAY_END_TIME };
}

export function billingCloseAfterDays(
  from: Date,
  days: number
): { date: string; time: string } {
  const first = nextBillingClose(from);
  const clamped = Math.min(MAX_RESERVATION_BILLING_DAYS, Math.max(1, Math.floor(days)));
  if (clamped <= 1) return first;
  return { date: addDaysToDate(first.date, clamped - 1), time: BILLING_DAY_END_TIME };
}

export function computeBillingDaysReservation(
  pickupDate: string,
  pickupTimeStart: string,
  days: number
): ReservationSchedule {
  const start = reservationDateTime(pickupDate, pickupTimeStart);
  if (Number.isNaN(start.getTime())) {
    throw new Error("תאריך או שעה לא תקינים");
  }
  const clamped = Math.min(MAX_RESERVATION_BILLING_DAYS, Math.max(1, Math.floor(days)));
  const end = billingCloseAfterDays(start, clamped);
  const startMinutes = parseTimeToMinutes(pickupTimeStart) ?? 0;
  const pickupGraceEnd = Math.min(startMinutes + PICKUP_GRACE_MINUTES, 23 * 60 + 59);
  const endAt = reservationDateTime(end.date, end.time);
  const hours = Math.max(1, Math.round((endAt.getTime() - start.getTime()) / 3_600_000));

  return {
    pickupDate,
    pickupTimeStart,
    pickupTimeEnd: minutesToTime(pickupGraceEnd),
    returnDate: end.date,
    returnTimeStart: end.time,
    returnTimeEnd: end.time,
    loanDurationHours: hours,
  };
}

export function validateBillingDaysReservation(
  pickupDate: string,
  pickupTimeStart: string,
  days: number,
  options?: { allowPast?: boolean }
): string | null {
  if (!pickupDate || !pickupTimeStart) {
    return "יש לבחור תאריך ושעת התחלה";
  }
  if (parseTimeToMinutes(pickupTimeStart) === null) {
    return "יש להזין שעת התחלה בפורמט תקין (HH:MM)";
  }
  if (!Number.isFinite(days) || days < 1 || days > MAX_RESERVATION_BILLING_DAYS) {
    return `ניתן לשריין עד ${MAX_RESERVATION_BILLING_DAYS} ימים רצופים`;
  }
  const start = reservationDateTime(pickupDate, pickupTimeStart);
  if (Number.isNaN(start.getTime())) {
    return "תאריך או שעה לא תקינים";
  }
  if (!options?.allowPast && start.getTime() < Date.now()) {
    return "לא ניתן לשמור לעבר — בחרו זמן עתידי";
  }
  return null;
}

/** 1-based billing day since checkout (window 22:00–22:00). */
export function billingDayIndex(startedAt: Date, now = new Date()): number {
  const firstClose = nextBillingClose(startedAt);
  const firstCloseAt = reservationDateTime(firstClose.date, firstClose.time);
  if (now.getTime() <= firstCloseAt.getTime()) return 1;
  const elapsed = now.getTime() - firstCloseAt.getTime();
  return 1 + Math.ceil(elapsed / 86_400_000);
}

export function isRemoteExtendDay(checkedOutAt?: string, now = new Date()): boolean {
  if (!checkedOutAt) return false;
  const start = new Date(checkedOutAt);
  if (Number.isNaN(start.getTime())) return false;
  return billingDayIndex(start, now) >= 3;
}

export function addOneBillingDay(
  dueDate: string,
  dueTime = BILLING_DAY_END_TIME
): { date: string; time: string } {
  return { date: addDaysToDate(dueDate, 1), time: dueTime || BILLING_DAY_END_TIME };
}

export function formatBillingDueLabel(date?: string, time?: string): string {
  if (!date) return "";
  const d = reservationDateTime(date, time || BILLING_DAY_END_TIME);
  if (Number.isNaN(d.getTime())) return `${date} · ${time || BILLING_DAY_END_TIME}`;
  return formatReservationDateTimeHe(d);
}

export function formatBillingDaysLabel(days: number): string {
  if (days === 1) return "יום אחד — עד 22:00";
  if (days === 2) return "יומיים — עד 22:00 ביום השני";
  return `${days} ימים — עד 22:00 ביום האחרון`;
}
