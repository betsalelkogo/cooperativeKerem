import type { Loan, Reservation } from "@/lib/types";
import { reservationDateTime } from "@/lib/israel-time";

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

function loanDueAt(loan: Pick<Loan, "dueReturnDate" | "dueReturnTimeEnd">): Date | null {
  if (!loan.dueReturnDate) return null;
  return reservationDateTime(loan.dueReturnDate, loan.dueReturnTimeEnd ?? "23:59");
}

/**
 * Effective due time for late fees.
 * Never earlier than checkout — if the reservation return already passed before
 * pickup (stale schedule / late pickup), due is checkout + planned duration.
 */
export function effectiveLateFeeDueAt(params: {
  reservation: Pick<
    Reservation,
    "returnDate" | "returnTimeEnd" | "returnTimeStart" | "loanDurationHours"
  >;
  loan?: Pick<Loan, "dueReturnDate" | "dueReturnTimeEnd" | "checkedOutAt"> | null;
  checkedOutAt?: Date | null;
}): Date {
  const { reservation, loan } = params;
  const checkedOutAt =
    params.checkedOutAt ??
    (loan?.checkedOutAt ? new Date(loan.checkedOutAt) : null);

  const fromLoan = loan ? loanDueAt(loan) : null;
  let dueAt = fromLoan && !Number.isNaN(fromLoan.getTime())
    ? fromLoan
    : scheduledReturnAt(reservation);

  if (checkedOutAt && !Number.isNaN(checkedOutAt.getTime())) {
    if (dueAt.getTime() <= checkedOutAt.getTime()) {
      const hours =
        typeof reservation.loanDurationHours === "number" &&
        reservation.loanDurationHours > 0
          ? reservation.loanDurationHours
          : 4;
      dueAt = new Date(checkedOutAt.getTime() + hours * 60 * 60 * 1000);
    }
  }

  return dueAt;
}

export function computeLateness(
  reservation: Pick<
    Reservation,
    "returnDate" | "returnTimeEnd" | "returnTimeStart" | "loanDurationHours"
  >,
  returnedAt: Date,
  options?: {
    loan?: Pick<Loan, "dueReturnDate" | "dueReturnTimeEnd" | "checkedOutAt"> | null;
    checkedOutAt?: Date | null;
  }
): { lateMinutes: number; dueAt: Date } {
  const dueAt = effectiveLateFeeDueAt({
    reservation,
    loan: options?.loan,
    checkedOutAt: options?.checkedOutAt,
  });
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
