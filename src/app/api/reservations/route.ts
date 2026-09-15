import { NextResponse } from "next/server";
import { getUidFromRequest } from "@/lib/firebase/admin";
import {
  createReservation,
  getReservationsByMember,
  getToolById,
  getToolKindWithAvailability,
  getGemachById,
  activeLoanToolIdsForMember,
  getMemberById,
  memberHasOpenPeerDebt,
  pickAvailableToolUnits,
  updateToolsStatus,
} from "@/lib/firestore/repository";
import { isReservationHardLockDue } from "@/lib/availability";
import {
  isPlatformGemach,
  resolveGemachReservationMode,
  resolveTotalReservationFee,
} from "@/lib/gemach";
import {
  hasAcceptedTerms,
  isPaidMember,
  MEMBERSHIP_REQUIRED_CODE,
  PEER_DEBT_REQUIRED_CODE,
  TERMS_REQUIRED_CODE,
} from "@/lib/membership";
import { formatCredits } from "@/lib/pots";
import {
  computeFixedHoursReservation,
  minutesToTime,
  validateDateRangeReservation,
  validateFixedHoursReservation,
} from "@/lib/reservation-times";
import type { ReservationSchedule } from "@/lib/reservation-times";
import { israelNowParts } from "@/lib/israel-time";
import {
  computeBillingDaysReservation,
  MAX_RESERVATION_BILLING_DAYS,
  validateBillingDaysReservation,
} from "@/lib/billing-days";

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
      billingDays,
      date,
      immediate,
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
      billingDays?: number;
      date?: string;
      immediate?: boolean;
    };

    const catalogKey = kindId ?? toolId;
    if (!catalogKey) {
      return NextResponse.json({ error: "נדרש מזהה כלי" }, { status: 400 });
    }

    const quantity = Math.min(Math.max(1, Number(quantityRaw) || 1), 500);

    // Resolve kind/gemach first so we can compute the schedule, then pick units
    // that are free for that window (soft future holds stay usable until 1h before).
    const kind = await getToolKindWithAvailability(catalogKey, { includeHolds: false });
    if (!kind) {
      return NextResponse.json({ error: "הכלי לא נמצא" }, { status: 404 });
    }

    const gemach = await getGemachById(kind.gemachId);
    if (!gemach) {
      return NextResponse.json({ error: "גמ״ח לא נמצא" }, { status: 404 });
    }

    if (!gemach.active) {
      return NextResponse.json({ error: "הגמ״ח סגור — לא ניתן לשריין כלים" }, { status: 403 });
    }

    const mode = resolveGemachReservationMode(gemach);
    let schedule: ReservationSchedule;
    let billedDays = 1;

    if (immediate) {
      const { date: todayIL, minutes } = israelNowParts();
      const startTime = minutesToTime(Math.max(0, minutes - 5));
      billedDays = Math.min(
        MAX_RESERVATION_BILLING_DAYS,
        Math.max(1, Number(billingDays) || 1)
      );
      schedule = computeBillingDaysReservation(todayIL, startTime, billedDays);
    } else if (mode === "fixed_hours" && isPlatformGemach(gemach)) {
      const resolvedPickup = pickupDate ?? date;
      if (!resolvedPickup || !pickupTimeStart) {
        return NextResponse.json(
          { error: "נדרשים תאריך ושעת התחלה" },
          { status: 400 }
        );
      }
      billedDays = Math.min(
        MAX_RESERVATION_BILLING_DAYS,
        Math.max(1, Number(billingDays) || 1)
      );
      const timeError = validateBillingDaysReservation(
        resolvedPickup,
        pickupTimeStart,
        billedDays
      );
      if (timeError) {
        return NextResponse.json({ error: timeError }, { status: 400 });
      }
      schedule = computeBillingDaysReservation(resolvedPickup, pickupTimeStart, billedDays);
    } else if (mode === "fixed_hours") {
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
        {
          tool: {
            defaultLoanHours: kind.defaultLoanHours,
            maxLoanHours: kind.maxLoanHours,
          },
          gemach,
        }
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

    const preferToolIds = await activeLoanToolIdsForMember(memberId);

    const units = await pickAvailableToolUnits(catalogKey, quantity, {
      pickupDate: schedule.pickupDate,
      pickupTimeStart: schedule.pickupTimeStart,
      returnDate: schedule.returnDate,
      returnTimeEnd: schedule.returnTimeEnd,
    }, {
      ignoreLoanMemberId: memberId,
      preferToolIds,
      skipMaintain: Boolean(immediate),
    });

    if (units.length === 0) {
      return NextResponse.json(
        { error: "אין יחידה זמינה לחלון הזמן שנבחר" },
        { status: 409 }
      );
    }

    if (units.length < quantity) {
      return NextResponse.json(
        {
          error: `רק ${units.length} יחידות זמינות בחלון זה — נסו כמות קטנה יותר או מועדים אחרים`,
        },
        { status: 409 }
      );
    }

    const tool = units[0];
    const { feeAmount, cooperativeFeeAmount } = resolveTotalReservationFee(
      gemach,
      tool,
      units.length,
      isPlatformGemach(gemach) ? billedDays : 1
    );

    const member = await getMemberById(memberId);

    // Cooperative tools require terms + paid membership. Partner gemachim stay
    // open for browsing and borrowing without joining the cooperative.
    if (isPlatformGemach(gemach)) {
      if (!hasAcceptedTerms(member)) {
        return NextResponse.json(
          {
            error: "יש לאשר את תקנון הקואופרטיב לפני השאלת כלי מהקואופרטיב.",
            code: TERMS_REQUIRED_CODE,
          },
          { status: 403 }
        );
      }

      if (!isPaidMember(member)) {
        return NextResponse.json(
          {
            error:
              "השאלת כלי מהקואופרטיב פתוחה לחברים ששילמו דמי הצטרפות. אפשר לגלוש במלאי — ולשלם בפייבוקס עד לאישור מנהל.",
            code: MEMBERSHIP_REQUIRED_CODE,
          },
          { status: 403 }
        );
      }

      if (await memberHasOpenPeerDebt(memberId)) {
        return NextResponse.json(
          {
            error:
              "יש לכם חוב פתוח לחבר. החזירו את החוב בעמוד העו״ש לפני השאלת כלי מהקואופרטיב.",
            code: PEER_DEBT_REQUIRED_CODE,
          },
          { status: 403 }
        );
      }
    }

    // Cooperative loans are charged from the internal balance only at checkout.
    // Block the booking up-front when the member can't cover the fee later.
    if (isPlatformGemach(gemach) && feeAmount > 0) {
      const balance = member?.creditBalance ?? 0;
      if (balance < feeAmount) {
        return NextResponse.json(
          {
            error:
              balance <= 0
                ? "אין לך יתרה. בקואופרטיב ההשאלה מתבצעת מהיתרה בלבד — פנו למנהל להטענת יתרה."
                : `היתרה שלך (${formatCredits(balance)}) אינה מספיקה לדמי ההשאלה (${formatCredits(feeAmount)}).`,
          },
          { status: 402 }
        );
      }
    }

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

    // Soft hold: keep tools available for gap loans until 1h before pickup.
    // Immediate / near-term pickups hard-lock right away.
    if (isReservationHardLockDue(reservation)) {
      await updateToolsStatus(toolIds, "reserved");
    }

    return NextResponse.json(reservation, { status: 201 });
  } catch {
    return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
  }
}
