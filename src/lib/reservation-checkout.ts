import type { Reservation, Tool } from "@/lib/types";
import {
  isReservationNoShowExpired,
  reservationCheckoutDeadline,
  reservationPickupStart,
} from "@/lib/reservation-expiry";

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

  if (tool && tool.status !== "reserved") {
    if (tool.status === "on_loan") {
      return { allowed: false, reason: "הכלי כבר מושאל — לא ניתן לבצע לקיחה" };
    }
    if (tool.status === "available") {
      return {
        allowed: false,
        reason: "הכלי אינו משויך לשריון זה — פנו למנהל",
      };
    }
    return { allowed: false, reason: "הכלי אינו זמין ללקיחה כרגע" };
  }

  const windowStart = reservationPickupWindowStart(reservation, now);
  const windowEnd = reservationPickupWindowEnd(reservation);

  if (now.getTime() < windowStart.getTime()) {
    const startLabel = windowStart.toLocaleString("he-IL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      allowed: false,
      reason: `ניתן להתחיל לקיחה החל מ-${startLabel}`,
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
