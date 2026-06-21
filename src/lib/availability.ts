import type { Loan, Reservation, Tool } from "@/lib/types";
import { reservationDateTime } from "@/lib/israel-time";

export interface ReservationWindow {
  pickupDate: string;
  pickupTimeStart?: string;
  returnDate: string;
  returnTimeEnd?: string;
}

function windowStartMs(w: ReservationWindow): number {
  const t = w.pickupTimeStart ?? "00:00";
  return reservationDateTime(w.pickupDate, t).getTime();
}

function windowEndMs(w: ReservationWindow): number {
  const t = w.returnTimeEnd ?? "23:59";
  return reservationDateTime(w.returnDate, t).getTime();
}

function windowsOverlap(a: ReservationWindow, b: ReservationWindow): boolean {
  return windowStartMs(a) < windowEndMs(b) && windowStartMs(b) < windowEndMs(a);
}

function reservationWindow(r: Reservation): ReservationWindow {
  return {
    pickupDate: r.pickupDate,
    pickupTimeStart: r.pickupTimeStart,
    returnDate: r.returnDate,
    returnTimeEnd: r.returnTimeEnd,
  };
}

/** Units that are lendable for a schedule (status + no overlapping hold). */
export function countUnitsAvailableInWindow(
  units: Tool[],
  schedule: ReservationWindow,
  reservationsByTool: Map<string, Reservation>,
  loansByTool: Map<string, Loan>
): number {
  let count = 0;
  for (const unit of units) {
    if (unit.status === "maintenance" || unit.status === "disabled") continue;

    const activeReservation = reservationsByTool.get(unit.id);
    const activeLoan = loansByTool.get(unit.id);

    if (unit.status === "available") {
      const blockingReservation =
        activeReservation &&
        (activeReservation.status === "pending" || activeReservation.status === "confirmed") &&
        windowsOverlap(schedule, reservationWindow(activeReservation));
      if (!blockingReservation) count += 1;
      continue;
    }

    if (unit.status === "reserved" && activeReservation) {
      if (
        (activeReservation.status === "pending" || activeReservation.status === "confirmed") &&
        windowsOverlap(schedule, reservationWindow(activeReservation))
      ) {
        continue;
      }
      count += 1;
      continue;
    }

    if (unit.status === "on_loan" && activeLoan?.dueReturnDate) {
      const freeAt = windowEndMs({
        pickupDate: activeLoan.dueReturnDate,
        returnDate: activeLoan.dueReturnDate,
        returnTimeEnd: activeLoan.dueReturnTimeEnd ?? "23:59",
      });
      if (freeAt <= windowStartMs(schedule)) count += 1;
    }
  }
  return count;
}

export function isUnitLendableNow(
  tool: Pick<Tool, "status">,
  schedule?: ReservationWindow
): boolean {
  if (tool.status === "maintenance" || tool.status === "disabled") return false;
  if (tool.status === "available") return true;
  if (!schedule) return false;
  return tool.status === "reserved" || tool.status === "on_loan";
}
