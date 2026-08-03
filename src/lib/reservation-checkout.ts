import type { Reservation, Tool } from "@/lib/types";
import {
  isReservationNoShowExpired,
  reservationCheckoutDeadline,
  reservationPickupStart,
} from "@/lib/reservation-expiry";
import { formatReservationDateTimeHe } from "@/lib/israel-time";

export function reservationPickupWindowStart(reservation: Reservation, now = new Date()): Date {
  return reservationPickupStart(reservation);
}

export function reservationPickupWindowEnd(reservation: Reservation): Date {
  return reservationCheckoutDeadline(reservation);
}

export function canStartCheckout(
  reservation: Reservation,
  tool: Pick<Tool, "status"> | null,
  now = new Date()
): { allowed: true } | { allowed: false; reason: string } {
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return { allowed: false, reason: "השריון אינו פעיל" };
  }

  // Soft reservations keep tools "available" until 1h before pickup (or claim
  // at checkout). Only block clearly unusable statuses here; unit claim may
  // reassign fungible units if the original soft-assigned ones are out on loan.
  if (tool && (tool.status === "maintenance" || tool.status === "disabled")) {
    return { allowed: false, reason: "הכלי אינו זמין ללקיחה כרגע" };
  }

  const windowStart = reservationPickupWindowStart(reservation, now);
  const windowEnd = reservationPickupWindowEnd(reservation);

  if (now.getTime() < windowStart.getTime()) {
    return {
      allowed: false,
      reason: `ניתן להתחיל לקיחה החל מ-${formatReservationDateTimeHe(windowStart)}`,
    };
  }

  if (now.getTime() > windowEnd.getTime()) {
    return {
      allowed: false,
      reason: isReservationNoShowExpired(reservation, now)
        ? "חלף מועד האיסוף — השריון בוטל אוטומטית"
        : "חלון האיסוף הסתיים — פנו למנהל הגמ״ח",
    };
  }

  return { allowed: true };
}
