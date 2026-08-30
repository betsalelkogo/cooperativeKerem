import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  getKindScheduleAvailability,
  getKindScheduleAvailabilityForHours,
} from "@/lib/firestore/repository";
import { computeFixedHoursReservation } from "@/lib/reservation-times";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = await getUidFromRequest(request);

    const pickupDate = searchParams.get("pickupDate") ?? undefined;
    const pickupTimeStart = searchParams.get("pickupTimeStart") ?? undefined;
    const returnDate = searchParams.get("returnDate") ?? undefined;
    const returnTimeEnd = searchParams.get("returnTimeEnd") ?? undefined;
    const loanDurationHoursRaw = searchParams.get("loanDurationHours");
    const hoursRaw = searchParams.get("hours");

    if (!pickupDate || !pickupTimeStart) {
      return NextResponse.json(
        { error: "נדרשים תאריך ושעת התחלה" },
        { status: 400 }
      );
    }

    const options = memberId ? { ignoreLoanMemberId: memberId } : undefined;

    if (hoursRaw) {
      const hours = hoursRaw
        .split(",")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (hours.length === 0) {
        return NextResponse.json({ error: "משכי השאלה אינם תקינים" }, { status: 400 });
      }
      const rows = await getKindScheduleAvailabilityForHours(
        id,
        pickupDate,
        pickupTimeStart,
        hours,
        options
      );
      const selectedHours = loanDurationHoursRaw ? Number(loanDurationHoursRaw) : hours[0];
      const selected =
        rows.find((r) => r.hours === selectedHours)?.availability ?? rows[0]?.availability;
      return NextResponse.json({
        ...selected,
        byHours: Object.fromEntries(rows.map((r) => [r.hours, r.availability])),
      });
    }

    let schedule = {
      pickupDate,
      pickupTimeStart,
      returnDate: returnDate ?? pickupDate,
      returnTimeEnd: returnTimeEnd ?? "23:59",
    };

    if (loanDurationHoursRaw) {
      const hours = Number(loanDurationHoursRaw);
      if (!Number.isFinite(hours) || hours <= 0) {
        return NextResponse.json({ error: "משך השאלה אינו תקין" }, { status: 400 });
      }
      const fixed = computeFixedHoursReservation(pickupDate, pickupTimeStart, hours);
      schedule = {
        pickupDate: fixed.pickupDate,
        pickupTimeStart: fixed.pickupTimeStart,
        returnDate: fixed.returnDate,
        returnTimeEnd: fixed.returnTimeEnd ?? "23:59",
      };
    }

    const availability = await getKindScheduleAvailability(id, schedule, options);
    return NextResponse.json({ ...availability, schedule });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאת שרת";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
