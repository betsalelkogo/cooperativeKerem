import type { Gemach, Tool } from "@/lib/types";
import { israelNowParts, reservationDateTime } from "@/lib/israel-time";
import {
  resolveToolDefaultLoanHours,
  resolveToolMaxLoanHours,
} from "@/lib/gemach";

export const PICKUP_GRACE_MINUTES = 30;
export const MAX_PICKUP_WINDOW_HOURS = 4;
export const DEFAULT_PICKUP_START = "09:00";
export const DEFAULT_RETURN_START = "17:00";
export const DEFAULT_RETURN_END = "18:00";

export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(total, 23 * 60 + 59));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addHoursToTime(start: string, hours: number): string {
  const startMinutes = parseTimeToMinutes(start);
  if (startMinutes === null) return start;
  return minutesToTime(startMinutes + hours * 60);
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = reservationDateTime(dateStr, "00:00");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Earliest pickup that passes "must be in the future" validation.
 * Wall-clock times are stored as HH:mm with seconds=0, so the current minute
 * is often already past — use the next Israel minute (rollover to tomorrow if needed).
 */
export function earliestFuturePickup(now = new Date()): { date: string; time: string } {
  const { date, minutes } = israelNowParts(now);
  const next = minutes + 1;
  if (next >= 24 * 60) {
    return { date: addDaysToDate(date, 1), time: "00:00" };
  }
  return { date, time: minutesToTime(next) };
}

export interface ReservationSchedule {
  pickupDate: string;
  pickupTimeStart: string;
  pickupTimeEnd: string;
  returnDate: string;
  returnTimeStart: string;
  returnTimeEnd: string;
  loanDurationHours?: number;
}

/** Build schedule for fixed-hours mode (start + N hours). */
export function computeFixedHoursReservation(
  pickupDate: string,
  pickupTimeStart: string,
  loanHours: number
): ReservationSchedule {
  const startMinutes = parseTimeToMinutes(pickupTimeStart);
  if (startMinutes === null) {
    throw new Error("שעת התחלה לא תקינה");
  }

  const loanEndMinutes = startMinutes + loanHours * 60;
  let dayOffset = 0;
  let endMinutesOnDay = loanEndMinutes;
  while (endMinutesOnDay >= 24 * 60) {
    endMinutesOnDay -= 24 * 60;
    dayOffset += 1;
  }

  const returnDate = dayOffset > 0 ? addDaysToDate(pickupDate, dayOffset) : pickupDate;
  const returnTimeEnd = minutesToTime(endMinutesOnDay);
  const pickupGraceEnd = Math.min(startMinutes + PICKUP_GRACE_MINUTES, loanEndMinutes - 1);

  return {
    pickupDate,
    pickupTimeStart,
    pickupTimeEnd: minutesToTime(pickupGraceEnd),
    returnDate,
    returnTimeStart: returnTimeEnd,
    returnTimeEnd,
    loanDurationHours: loanHours,
  };
}

export function validateFixedHoursReservation(
  pickupDate: string,
  pickupTimeStart: string,
  loanHours: number,
  limits?:
    | { minHours: number; maxHours: number }
    | ({ tool?: Pick<Tool, "defaultLoanHours" | "maxLoanHours"> } & { gemach: Gemach })
): string | null {
  if (!pickupDate || !pickupTimeStart) {
    return "יש לבחור תאריך ושעת התחלה";
  }
  if (parseTimeToMinutes(pickupTimeStart) === null) {
    return "יש להזין שעת התחלה בפורמט תקין (HH:MM)";
  }
  if (!Number.isFinite(loanHours) || loanHours < 1) {
    return "משך ההשאלה לא תקין";
  }

  const minH =
    limits && "minHours" in limits
      ? limits.minHours
      : limits?.gemach
        ? resolveToolDefaultLoanHours(limits.tool ?? {}, limits.gemach)
        : 4;
  const maxH =
    limits && "minHours" in limits
      ? limits.maxHours
      : limits?.gemach
        ? resolveToolMaxLoanHours(limits.tool ?? {}, limits.gemach)
        : 24;
  if (loanHours < minH || loanHours > maxH) {
    return `משך ההשאלה חייב להיות בין ${minH} ל-${maxH} שעות`;
  }

  const start = reservationDateTime(pickupDate, pickupTimeStart);
  if (Number.isNaN(start.getTime())) {
    return "תאריך או שעה לא תקינים";
  }
  if (start.getTime() < Date.now()) {
    return "לא ניתן לשמור לעבר — בחרו זמן עתידי";
  }

  return null;
}

export function validateTimeRange(
  from: string,
  to: string,
  options?: { maxHours?: number; label?: string }
): string | null {
  const fromMinutes = parseTimeToMinutes(from);
  const toMinutes = parseTimeToMinutes(to);
  const label = options?.label ?? "חלון הזמן";

  if (fromMinutes === null || toMinutes === null) {
    return "יש להזין שעות בפורמט תקין (HH:MM)";
  }
  if (toMinutes <= fromMinutes) {
    return `${label}: שעת הסיום חייבת להיות אחרי שעת ההתחלה`;
  }
  if (options?.maxHours) {
    const windowHours = (toMinutes - fromMinutes) / 60;
    if (windowHours > options.maxHours) {
      return `${label}: מקסימום ${options.maxHours} שעות`;
    }
  }
  return null;
}

export function validateDateRangeReservation(input: {
  pickupDate: string;
  pickupTimeStart: string;
  pickupTimeEnd: string;
  returnDate: string;
  returnTimeStart: string;
  returnTimeEnd: string;
}): string | null {
  const pickupWindowError = validateTimeRange(input.pickupTimeStart, input.pickupTimeEnd, {
    maxHours: MAX_PICKUP_WINDOW_HOURS,
    label: "חלון האיסוף",
  });
  if (pickupWindowError) return pickupWindowError;

  const returnWindowError = validateTimeRange(input.returnTimeStart, input.returnTimeEnd, {
    label: "חלון ההחזרה",
  });
  if (returnWindowError) return returnWindowError;

  if (input.returnDate < input.pickupDate) {
    return "תאריך ההחזרה חייב להיות באותו יום או אחרי תאריך האיסוף";
  }

  if (input.returnDate === input.pickupDate) {
    const pickupStart = parseTimeToMinutes(input.pickupTimeStart);
    const returnStart = parseTimeToMinutes(input.returnTimeStart);
    if (pickupStart !== null && returnStart !== null && returnStart < pickupStart) {
      return "שעת ההחזרה חייבת להיות אחרי שעת האיסוף באותו יום";
    }
  }

  const start = reservationDateTime(input.pickupDate, input.pickupTimeStart);
  if (!Number.isNaN(start.getTime()) && start.getTime() < Date.now()) {
    return "לא ניתן לשמור לעבר — בחרו זמן עתידי";
  }

  return null;
}

/** @deprecated use computeFixedHoursReservation */
export function computeFourHourReservation(pickupDate: string, pickupTimeStart: string) {
  return computeFixedHoursReservation(pickupDate, pickupTimeStart, 4);
}

export function formatLoanDurationLabel(hours: number): string {
  return hours === 1 ? "שעה אחת" : `${hours} שעות`;
}

export function formatTimeRange(from?: string, to?: string): string {
  if (!from || !to) return "";
  return `${from}–${to}`;
}
