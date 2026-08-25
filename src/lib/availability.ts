import type { Loan, Reservation, Tool } from "@/lib/types";
import { reservationDateTime } from "@/lib/israel-time";
import { reservationPickupStart } from "@/lib/reservation-expiry";

/** Hours before scheduled pickup when a soft reservation becomes a hard lock. */
export const RESERVATION_HARD_LOCK_HOURS = 1;

export interface ReservationWindow {
  pickupDate: string;
  pickupTimeStart?: string;
  returnDate: string;
  returnTimeEnd?: string;
}

/** All active reservations keyed by physical unit id. */
export type ReservationsByTool = Map<string, Reservation[]>;

export type AvailabilityOptions = {
  ignoreReservationId?: string;
  /**
   * Current borrower's member id. Their own active loan does not block a
   * follow-on reservation (extension) on the same unit.
   */
  ignoreLoanMemberId?: string;
  preferToolIds?: string[];
};

function windowStartMs(w: ReservationWindow): number {
  const t = w.pickupTimeStart ?? "00:00";
  return reservationDateTime(w.pickupDate, t).getTime();
}

function windowEndMs(w: ReservationWindow): number {
  const t = w.returnTimeEnd ?? "23:59";
  return reservationDateTime(w.returnDate, t).getTime();
}

export function reservationWindow(r: Reservation): ReservationWindow {
  return {
    pickupDate: r.pickupDate,
    pickupTimeStart: r.pickupTimeStart,
    returnDate: r.returnDate,
    returnTimeEnd: r.returnTimeEnd,
  };
}

/** Moment the reservation starts blocking inventory (pickup − 1 hour). */
export function reservationHardLockStart(reservation: Reservation): Date {
  const start = reservationPickupStart(reservation);
  return new Date(start.getTime() - RESERVATION_HARD_LOCK_HOURS * 60 * 60 * 1000);
}

export function isReservationHardLockDue(
  reservation: Reservation,
  now = new Date()
): boolean {
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return false;
  }
  return now.getTime() >= reservationHardLockStart(reservation).getTime();
}

function reservationHoldStartMs(r: Reservation): number {
  return reservationHardLockStart(r).getTime();
}

function reservationHoldEndMs(r: Reservation): number {
  return windowEndMs(reservationWindow(r));
}

function scheduleOverlapsReservationHold(
  schedule: ReservationWindow,
  reservation: Reservation
): boolean {
  const sStart = windowStartMs(schedule);
  const sEnd = windowEndMs(schedule);
  const hStart = reservationHoldStartMs(reservation);
  const hEnd = reservationHoldEndMs(reservation);
  return sStart < hEnd && hStart < sEnd;
}

function loanFreeAtMs(loan: Loan): number | null {
  if (!loan.dueReturnDate) return null;
  return windowEndMs({
    pickupDate: loan.dueReturnDate,
    returnDate: loan.dueReturnDate,
    returnTimeEnd: loan.dueReturnTimeEnd ?? "23:59",
  });
}

function isActiveReservation(r: Reservation | undefined): r is Reservation {
  return Boolean(r && (r.status === "pending" || r.status === "confirmed"));
}

export function holdsForUnit(
  reservationsByTool: ReservationsByTool,
  unitId: string
): Reservation[] {
  return reservationsByTool.get(unitId) ?? [];
}

function isOwnActiveLoan(
  loan: Loan | undefined,
  memberId: string | undefined
): boolean {
  return Boolean(loan && memberId && loan.memberId === memberId);
}

/** Whether a unit can be booked for `schedule` (status + no overlapping hold). */
export function isUnitAvailableInWindow(
  unit: Tool,
  schedule: ReservationWindow,
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>,
  options?: AvailabilityOptions
): boolean {
  if (unit.status === "maintenance" || unit.status === "disabled") return false;

  const holds = holdsForUnit(reservationsByTool, unit.id);
  const activeLoan = loansByTool.get(unit.id);
  const ownLoan = isOwnActiveLoan(activeLoan, options?.ignoreLoanMemberId);

  if (unit.status === "on_loan" && !ownLoan) {
    if (!activeLoan) return false;
    const freeAt = loanFreeAtMs(activeLoan);
    if (freeAt === null || freeAt > windowStartMs(schedule)) return false;
  }

  const blockingHold = holds.some(
    (reservation) =>
      isActiveReservation(reservation) &&
      reservation.id !== options?.ignoreReservationId &&
      scheduleOverlapsReservationHold(schedule, reservation)
  );
  if (blockingHold) return false;

  if (unit.status === "on_loan") return true;
  return unit.status === "available" || unit.status === "reserved";
}

/** Units that are lendable for a schedule (status + no overlapping hold). */
export function countUnitsAvailableInWindow(
  units: Tool[],
  schedule: ReservationWindow,
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>,
  options?: AvailabilityOptions
): number {
  return units.filter((unit) =>
    isUnitAvailableInWindow(unit, schedule, reservationsByTool, loansByTool, options)
  ).length;
}

export function pickUnitsAvailableInWindow(
  units: Tool[],
  schedule: ReservationWindow,
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>,
  quantity: number,
  options?: AvailabilityOptions
): Tool[] {
  const free = units.filter((unit) =>
    isUnitAvailableInWindow(unit, schedule, reservationsByTool, loansByTool, options)
  );

  const preferred = options?.preferToolIds?.length
    ? free.filter((u) => options.preferToolIds!.includes(u.id))
    : [];
  const preferredSet = new Set(preferred.map((u) => u.id));
  const rest = free.filter((u) => !preferredSet.has(u.id));
  return [...preferred, ...rest].slice(0, Math.max(0, quantity));
}

/**
 * Unit can be taken right now for a short gap loan:
 * not out / disabled, and not inside another reservation's hard-lock window.
 */
export function isUnitLendableNow(
  unit: Tool,
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>,
  now = new Date()
): boolean {
  if (unit.status === "maintenance" || unit.status === "disabled") return false;
  if (unit.status === "on_loan") return false;

  const holds = holdsForUnit(reservationsByTool, unit.id);
  if (holds.some((r) => isActiveReservation(r) && isReservationHardLockDue(r, now))) {
    return false;
  }

  // Soft future hold (status may still be reserved from older hard-locks) — still lendable.
  return unit.status === "available" || unit.status === "reserved";
}

export function countUnitsLendableNow(
  units: Tool[],
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>,
  now = new Date()
): number {
  return units.filter((u) =>
    isUnitLendableNow(u, reservationsByTool, loansByTool, now)
  ).length;
}

/** Units committed to an active reservation (soft or hard) and not currently on loan. */
export function countUnitsReservedForFuture(
  units: Tool[],
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>
): number {
  let count = 0;
  for (const unit of units) {
    if (unit.status === "on_loan" || loansByTool.has(unit.id)) continue;
    if (holdsForUnit(reservationsByTool, unit.id).some(isActiveReservation)) count += 1;
  }
  return count;
}

export function pickUnitsLendableNow(
  units: Tool[],
  reservationsByTool: ReservationsByTool,
  loansByTool: Map<string, Loan>,
  quantity: number,
  now = new Date()
): Tool[] {
  return units
    .filter((u) => isUnitLendableNow(u, reservationsByTool, loansByTool, now))
    .slice(0, Math.max(0, quantity));
}

/** Active reservations that touch any of these units. */
export function activeReservationsForUnits(
  units: Tool[],
  reservationsByTool: ReservationsByTool
): Reservation[] {
  const byId = new Map<string, Reservation>();
  for (const unit of units) {
    for (const r of holdsForUnit(reservationsByTool, unit.id)) {
      if (isActiveReservation(r)) byId.set(r.id, r);
    }
  }
  return [...byId.values()];
}

/**
 * Earliest soft/hard hold that starts at or after `afterMs`
 * (return must finish before this hold begins).
 */
export function findNextHoldAfter(
  reservations: Reservation[],
  afterMs: number
): Reservation | null {
  let best: Reservation | null = null;
  let bestStart = Number.POSITIVE_INFINITY;
  for (const r of reservations) {
    if (!isActiveReservation(r)) continue;
    const start = reservationHoldStartMs(r);
    if (start >= afterMs && start < bestStart) {
      best = r;
      bestStart = start;
    }
  }
  return best;
}

export function reservationHoldBounds(reservation: Reservation): {
  hardLockAt: Date;
  holdEnd: Date;
} {
  return {
    hardLockAt: reservationHardLockStart(reservation),
    holdEnd: new Date(reservationHoldEndMs(reservation)),
  };
}

/** Latest return date among holds (YYYY-MM-DD), if any. */
export function latestHoldReturnDate(holds: Reservation[]): string | undefined {
  let latest: string | undefined;
  for (const r of holds) {
    if (r.returnDate && (!latest || r.returnDate > latest)) latest = r.returnDate;
  }
  return latest;
}

export function primaryHold(holds: Reservation[]): Reservation | undefined {
  if (holds.length === 0) return undefined;
  return holds.reduce((best, r) => (r.createdAt > best.createdAt ? r : best));
}
