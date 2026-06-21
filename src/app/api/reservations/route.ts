import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createReservation,
  getReservationsByMember,
  getToolById,
  getGemachById,
  updateToolStatus,
  pickAvailableToolUnits,
  pickAvailableToolUnit,
} from "@/lib/firestore/repository";
import { resolveGemachReservationMode, resolveTotalReservationFee } from "@/lib/gemach";
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
      quantity: quantityRaw,
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
      quantity?: number;
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

    const quantity = Math.min(Math.max(1, Number(quantityRaw) || 1), 500);

    let units = await pickAvailableToolUnits(catalogKey, quantity);
    if (units.length < quantity) {
      const single = await pickAvailableToolUnit(catalogKey);
      if (single && units.length === 0) {
        units = [single];
      }
    }

    if (units.length === 0) {
      return NextResponse.json({ error: "אין יחידה זמינה מסוג זה כרגע" }, { status: 409 });
    }

    if (units.length < quantity) {
      return NextResponse.json(
        {
          error: `רק ${units.length} יחידות זמינות — נסו כמות קטנה יותר`,
        },
        { status: 409 }
      );
    }

    const tool = units[0];
    const gemach = await getGemachById(tool.gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }

    if (!gemach.active) {
      return NextResponse.json({ error: "הגמ״ח סגור — לא ניתן לשריין כלים" }, { status: 403 });
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

    const { feeAmount, cooperativeFeeAmount } = resolveTotalReservationFee(
      gemach,
      tool,
      units.length
    );
    const kindIdResolved = tool.kindId ?? tool.id;
    const toolIds = units.map((u) => u.id);
    const groupId = toolIds.length > 1 ? `grp-${Date.now()}` : undefined;

    const reservation = await createReservation({
      memberId,
      toolId: toolIds[0],
      kindId: kindIdResolved,
      quantity: toolIds.length,
      toolIds,
      groupId,
      pickupDate: schedule.pickupDate,
      pickupTimeStart: schedule.pickupTimeStart,
      pickupTimeEnd: schedule.pickupTimeEnd,
      returnDate: schedule.returnDate,
      returnTimeStart: schedule.returnTimeStart,
      returnTimeEnd: schedule.returnTimeEnd,
      loanDurationHours: schedule.loanDurationHours,
      status: "confirmed",
      feeAmount,
      cooperativeFeeAmount,
    });

    await Promise.all(toolIds.map((id) => updateToolStatus(id, "reserved")));

    return NextResponse.json(reservation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
