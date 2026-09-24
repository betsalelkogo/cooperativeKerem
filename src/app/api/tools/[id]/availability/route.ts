import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  getKindScheduleAvailability,
  getKindScheduleAvailabilityForDays,
  getKindScheduleAvailabilityForHours,
} from "@/lib/firestore/repository";
import { computeFixedHoursReservation, normalizeTimeToHhMm } from "@/lib/reservation-times";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const memberId = await getUidFromRequest(request);

    const pickupDate = searchParams.get("pickupDate") ?? undefined;
    const pickupTimeStartRaw = searchParams.get("pickupTimeStart") ?? undefined;
    const pickupTimeStart = pickupTimeStartRaw
      ? normalizeTimeToHhMm(pickupTimeStartRaw) ?? pickupTimeStartRaw
      : undefined;
    const returnDate = searchParams.get("returnDate") ?? undefined;
    const returnTimeEndRaw = searchParams.get("returnTimeEnd") ?? undefined;
    const returnTimeEnd = returnTimeEndRaw
      ? normalizeTimeToHhMm(returnTimeEndRaw) ?? returnTimeEndRaw
      : undefined;
    const loanDurationHoursRaw = searchParams.get("loanDurationHours");
    const hoursRaw = searchParams.get("hours");
    const daysRaw = searchParams.get("days");

    if (!pickupDate || !pickupTimeStart) {
      return NextResponse.json(
        { error: "נדרשים תאריך ושעת התחלה" },
        { status: 400 }
      );
    }

    const options = memberId ? { ignoreLoanMemberId: memberId } : undefined;

    if (daysRaw) {
      const days = daysRaw
        .split(",")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (days.length === 0) {
        return NextResponse.json({ error: "מספר ימים אינו תקין" }, { status: 400 });
      }
      const rows = await getKindScheduleAvailabilityForDays(
        id,
        pickupDate,
        pickupTimeStart,
        days,
        options
      );
      const selectedDays = searchParams.get("billingDays")
        ? Number(searchParams.get("billingDays"))
        : days[0];
      const selected =
        rows.find((r) => r.days === selectedDays)?.availability ?? rows[0]?.availability;
      return NextResponse.json({
        ...selected,
        byDays: Object.fromEntries(rows.map((r) => [r.days, r.availability])),
      });
    }

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
