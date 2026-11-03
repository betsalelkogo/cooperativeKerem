import type { Reservation } from "@/lib/types";
import { israelNowParts, reservationDateTime } from "@/lib/israel-time";

/** Hours after scheduled pickup start before a no-show reservation is cancelled. */
export const PICKUP_NO_SHOW_HOURS = 2;

export function reservationPickupStart(reservation: Reservation): Date {
  const time = reservation.pickupTimeStart ?? "00:00";
  return reservationDateTime(reservation.pickupDate, time);
}

/** Last moment the borrower may pick up before the reservation is auto-cancelled. */
export function reservationNoShowDeadline(reservation: Reservation): Date {
  const start = reservationPickupStart(reservation);
  return new Date(start.getTime() + PICKUP_NO_SHOW_HOURS * 60 * 60 * 1000);
}

export function isReservationNoShowExpired(
  reservation: Reservation,
  now = new Date()
): boolean {
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return false;
  }
  const deadline = reservationNoShowDeadline(reservation);
  if (Number.isNaN(deadline.getTime())) {
    const pickupDate = reservation.pickupDate.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(pickupDate) && pickupDate < israelNowParts(now).date;
  }
  return now.getTime() > deadline.getTime();
}

export function formatNoShowDeadlineHe(reservation: Reservation): string {
  const deadline = reservationNoShowDeadline(reservation);
  const time = `${String(deadline.getHours()).padStart(2, "0")}:${String(deadline.getMinutes()).padStart(2, "0")}`;
  const date = deadline.toISOString().split("T")[0];
  if (date !== reservation.pickupDate) {
    return deadline.toLocaleString("he-IL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return time;
}

/** Checkout window end = pickup start + no-show grace (not the short pickup slot). */
export function reservationCheckoutDeadline(reservation: Reservation): Date {
  return reservationNoShowDeadline(reservation);
}
