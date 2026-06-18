import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createReservation,
  getReservationsByMember,
  getToolById,
  getGemachById,
  updateToolStatus,
  resolveReservationFee,
  pickAvailableToolUnit,
} from "@/lib/firestore/repository";
import { resolveGemachReservationMode } from "@/lib/gemach";
import {
  computeFixedHoursReservation,
  validateDateRangeReservation,
  validateFixedHoursReservation,
} from "@/lib/reservation-times";
import type { ReservationSchedule } from "@/lib/reservation-times";

export async function GET(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const reservations = await getReservationsByMember(memberId);
    const active = reservations.filter(
      (r) => r.status === "pending" || r.status === "confirmed"
    );

    const withTools = await Promise.all(
      active.map(async (reservation) => ({
        reservation,
        tool: await getToolById(reservation.toolId),
      }))
    );

    return NextResponse.json(withTools);
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const memberId = await getUidFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "נדרשת התחברות" }, { status: 401 });
    }

    const body = await request.json();
    const {
      toolId,
      kindId,
      pickupDate,
      pickupTimeStart,
      pickupTimeEnd,
      returnDate,
      returnTimeStart,
      returnTimeEnd,
      loanDurationHours,
      date,
    } = body as {
      toolId?: string;
      kindId?: string;
      pickupDate?: string;
      pickupTimeStart?: string;
      pickupTimeEnd?: string;
      returnDate?: string;
      returnTimeStart?: string;
      returnTimeEnd?: string;
      loanDurationHours?: number;
      date?: string;
    };

    const catalogKey = kindId ?? toolId;
    if (!catalogKey) {
      return NextResponse.json({ error: "נדרש מזהה כלי" }, { status: 400 });
    }

    let tool = await pickAvailableToolUnit(catalogKey);
    if (!tool) {
      const direct = await getToolById(catalogKey);
      if (direct?.status === "available") {
        tool = direct;
      }
    }

    if (!tool) {
      return NextResponse.json({ error: "אין יחידה זמינה מסוג זה כרגע" }, { status: 409 });
    }

    const gemach = await getGemachById(tool.gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }

    if (!gemach.active) {
      return NextResponse.json({ error: "הגמ״ח סגור — לא ניתן לשמור כלים" }, { status: 403 });
    }

    const mode = resolveGemachReservationMode(gemach);
    let schedule: ReservationSchedule;

    if (mode === "fixed_hours") {
      const resolvedPickup = pickupDate ?? date;
      if (!resolvedPickup || !pickupTimeStart) {
        return NextResponse.json(
          { error: "נדרשים תאריך ושעת התחלה" },
          { status: 400 }
        );
      }

      const hours = Number(loanDurationHours);
      const timeError = validateFixedHoursReservation(
        resolvedPickup,
        pickupTimeStart,
        hours,
        { tool, gemach }
      );
      if (timeError) {
        return NextResponse.json({ error: timeError }, { status: 400 });
      }

      schedule = computeFixedHoursReservation(resolvedPickup, pickupTimeStart, hours);
    } else {
      const resolvedPickup = pickupDate ?? date;
      if (!resolvedPickup || !returnDate || !pickupTimeStart || !pickupTimeEnd) {
        return NextResponse.json(
          { error: "נדרשים תאריך איסוף, חלון איסוף ותאריך החזרה" },
          { status: 400 }
        );
      }

      const timeError = validateDateRangeReservation({
        pickupDate: resolvedPickup,
        pickupTimeStart,
        pickupTimeEnd,
        returnDate,
        returnTimeStart: returnTimeStart ?? returnTimeEnd ?? "18:00",
        returnTimeEnd: returnTimeEnd ?? "18:00",
      });
      if (timeError) {
        return NextResponse.json({ error: timeError }, { status: 400 });
      }

      schedule = {
        pickupDate: resolvedPickup,
        pickupTimeStart,
        pickupTimeEnd,
        returnDate,
        returnTimeStart: returnTimeStart ?? returnTimeEnd ?? "17:00",
        returnTimeEnd: returnTimeEnd ?? "18:00",
      };
    }

    const feeAmount = resolveReservationFee(gemach, tool);

    const reservation = await createReservation({
      memberId,
      toolId: tool.id,
      pickupDate: schedule.pickupDate,
      pickupTimeStart: schedule.pickupTimeStart,
      pickupTimeEnd: schedule.pickupTimeEnd,
      returnDate: schedule.returnDate,
      returnTimeStart: schedule.returnTimeStart,
      returnTimeEnd: schedule.returnTimeEnd,
      loanDurationHours: schedule.loanDurationHours,
      status: "confirmed",
      feeAmount,
    });

    await updateToolStatus(tool.id, "reserved");

    return NextResponse.json(reservation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
