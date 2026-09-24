"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { inventoryLabel } from "@/lib/tool-kinds";
import {
  computeFixedHoursReservation,
  DEFAULT_RETURN_END,
  DEFAULT_RETURN_START,
  earliestFuturePickup,
  formatLoanDurationLabel,
  MAX_PICKUP_WINDOW_HOURS,
  parseTimeToMinutes,
  normalizeTimeToHhMm,
  validateDateRangeReservation,
  validateFixedHoursReservation,
  addHoursToTime,
} from "@/lib/reservation-times";
import { israelNowParts, reservationDateTime } from "@/lib/israel-time";
import { formatDateHe } from "@/lib/dates";
import { formatCredits } from "@/lib/pots";
import { BackLink } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { JoinMembershipBanner } from "@/components/membership/JoinMembershipBanner";
import { PeerDebtBanner } from "@/components/membership/PeerDebtBanner";
import type { GemachReservationMode, ToolKindWithAvailability } from "@/lib/types";
import { LOAN_HOUR_CANDIDATES } from "@/lib/gemach";
import {
  computeBillingDaysReservation,
  formatBillingDaysLabel,
  MAX_RESERVATION_BILLING_DAYS,
  validateBillingDaysReservation,
} from "@/lib/billing-days";
import {
  isPaidMember,
  MEMBERSHIP_REQUIRED_CODE,
  PEER_DEBT_REQUIRED_CODE,
  TERMS_REQUIRED_CODE,
} from "@/lib/membership";
import { RESERVATION_HARD_LOCK_HOURS } from "@/lib/availability";
import { findCachedKind, rememberKind } from "@/lib/client-catalog";

type WindowAvailability = {
  availableUnits: number;
  totalUnits: number;
  lendableNow: number;
  reservedForFuture: number;
  hardLockHours: number;
  nextHold: null | {
    pickupDate: string;
    pickupTimeStart?: string;
    quantity: number;
    hardLockAtLabel: string;
    mustReturnByLabel: string;
  };
  byHours?: Record<string, WindowAvailability>;
  byDays?: Record<string, WindowAvailability>;
};

function initialPickup(searchParams: URLSearchParams): {
  date: string;
  time: string;
  extending: boolean;
} {
  const asap = earliestFuturePickup();
  const extending = searchParams.get("extend") === "1";
  const date = searchParams.get("pickupDate");
  const time = searchParams.get("pickupTimeStart");
  if (!date || !time) return { ...asap, extending };
  const start = reservationDateTime(date, time);
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    return { ...asap, extending };
  }
  return { date, time, extending };
}

function loanHourOptions(kind: ToolKindWithAvailability): number[] {
  const min = kind.gemachDefaultLoanHours ?? 4;
  const max = kind.gemachMaxLoanHours ?? 24;
  const candidates = LOAN_HOUR_CANDIDATES.filter((h) => h >= min && h <= max);
  if (!candidates.includes(min)) candidates.unshift(min);
  if (!candidates.includes(max)) candidates.push(max);
  return [...new Set(candidates)].sort((a, b) => a - b);
}

export default function ReserveToolPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
        </div>
      }
    >
      <ReserveToolForm />
    </Suspense>
  );
}

function ReserveToolForm() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { member, loading: authLoading, getIdToken } = useAuth();
  const pickupQuery = useMemo(
    () => initialPickup(searchParams),
    [searchParams]
  );
  const [kind, setKind] = useState<ToolKindWithAvailability | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gateCode, setGateCode] = useState<string | null>(null);

  const mode: GemachReservationMode = kind?.gemachReservationMode ?? "fixed_hours";
  const isFixedHours = mode === "fixed_hours";
  const useBillingDays = isFixedHours && !kind?.isPartnerGemach;

  // ASAP defaults, or consecutive start after the current loan when extending.
  const [pickupDefaults] = useState(() => pickupQuery);
  const [pickupDate, setPickupDate] = useState(pickupDefaults.date);
  const [pickupTimeStart, setPickupTimeStart] = useState(pickupDefaults.time);
  const extending = pickupQuery.extending;
  const [loanHours, setLoanHours] = useState(4);
  const [billingDays, setBillingDays] = useState(1);
  const [availByDays, setAvailByDays] = useState<Record<string, WindowAvailability> | null>(
    null
  );
  const [pickupTimeEnd, setPickupTimeEnd] = useState(
    addHoursToTime(pickupDefaults.time, MAX_PICKUP_WINDOW_HOURS)
  );
  const [returnDate, setReturnDate] = useState(pickupDefaults.date);
  const [returnTimeStart, setReturnTimeStart] = useState(() => {
    const pickupMins = parseTimeToMinutes(pickupDefaults.time) ?? 0;
    const defaultReturn = parseTimeToMinutes(DEFAULT_RETURN_START) ?? 17 * 60;
    // Evening defaults don't work for afternoon/evening ASAP pickups.
    if (defaultReturn <= pickupMins) {
      return addHoursToTime(pickupDefaults.time, 4);
    }
    return DEFAULT_RETURN_START;
  });
  const [returnTimeEnd, setReturnTimeEnd] = useState(() => {
    const pickupMins = parseTimeToMinutes(pickupDefaults.time) ?? 0;
    const defaultReturn = parseTimeToMinutes(DEFAULT_RETURN_START) ?? 17 * 60;
    if (defaultReturn <= pickupMins) {
      return addHoursToTime(pickupDefaults.time, 5);
    }
    return DEFAULT_RETURN_END;
  });
  const [quantity, setQuantity] = useState(1);
  const [quantityDraft, setQuantityDraft] = useState("1");
  const [windowAvail, setWindowAvail] = useState<WindowAvailability | null>(null);
  const [availByHours, setAvailByHours] = useState<Record<string, WindowAvailability> | null>(
    null
  );
  const [availLoading, setAvailLoading] = useState(false);
  const [viableHours, setViableHours] = useState<number[] | null>(null);

  const hourOptions = useMemo(
    () => (kind ? loanHourOptions(kind) : [4]),
    [kind]
  );

  useEffect(() => {
    if (kind?.gemachDefaultLoanHours) {
      setLoanHours(kind.gemachDefaultLoanHours);
    }
  }, [kind?.gemachDefaultLoanHours]);

  useEffect(() => {
    const cached = findCachedKind(params.id);
    if (cached) {
      setKind(cached);
      return;
    }
    fetch(`/api/tools/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("הכלי לא נמצא");
        return res.json();
      })
      .then((data: ToolKindWithAvailability) => {
        rememberKind(data);
        setKind(data);
      })
      .catch((err) => setLoadError(err.message));
  }, [params.id]);

  const fixedSchedule = useMemo(() => {
    if (!isFixedHours || !pickupDate || !pickupTimeStart) return null;
    try {
      if (useBillingDays) {
        return computeBillingDaysReservation(pickupDate, pickupTimeStart, billingDays);
      }
      return computeFixedHoursReservation(pickupDate, pickupTimeStart, loanHours);
    } catch {
      return null;
    }
  }, [isFixedHours, useBillingDays, pickupDate, pickupTimeStart, loanHours, billingDays]);

  // One availability request covers the selected window and all duration options.
  useEffect(() => {
    if (!kind || !pickupDate || !pickupTimeStart) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAvailLoading(true);
      try {
        const qs = new URLSearchParams({
          pickupDate,
          pickupTimeStart,
        });
        if (isFixedHours && useBillingDays) {
          qs.set("days", Array.from({ length: MAX_RESERVATION_BILLING_DAYS }, (_, i) => i + 1).join(","));
          qs.set("billingDays", String(billingDays));
        } else if (isFixedHours) {
          qs.set("hours", hourOptions.join(","));
          qs.set("loanDurationHours", String(loanHours));
        } else if (returnDate && returnTimeEnd) {
          qs.set("returnDate", returnDate);
          qs.set("returnTimeEnd", returnTimeEnd);
        } else {
          setAvailLoading(false);
          return;
        }

        const token = await getIdToken();
        const res = await authFetch(
          `/api/tools/${encodeURIComponent(kind.catalogId)}/availability?${qs}`,
          { token, signal: controller.signal }
        );
        if (!res.ok) throw new Error("שגיאה בבדיקת זמינות");
        const data = (await res.json()) as WindowAvailability;
        if (data.byHours) setAvailByHours(data.byHours);
        else setAvailByHours(null);
        if (data.byDays) setAvailByDays(data.byDays);
        else setAvailByDays(null);
        const selected =
          data.byDays?.[String(billingDays)] ?? data.byHours?.[String(loanHours)] ?? data;
        setWindowAvail(selected);
        setQuantity((q) => {
          const next =
            selected.availableUnits > 0 ? Math.min(q, selected.availableUnits) : q;
          setQuantityDraft(String(next));
          return next;
        });
        if (data.byHours) {
          const okHours = hourOptions.filter(
            (h) => (data.byHours?.[String(h)]?.availableUnits ?? 0) > 0
          );
          setViableHours(okHours);
          setLoanHours((current) =>
            okHours.length > 0 && !okHours.includes(current) ? okHours[0] : current
          );
        }
        if (data.byDays) {
          const okDays = Array.from(
            { length: MAX_RESERVATION_BILLING_DAYS },
            (_, i) => i + 1
          ).filter((d) => (data.byDays?.[String(d)]?.availableUnits ?? 0) > 0);
          setBillingDays((current) =>
            okDays.length > 0 && !okDays.includes(current) ? okDays[0] : current
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setWindowAvail(null);
      } finally {
        setAvailLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [
    kind,
    isFixedHours,
    pickupDate,
    pickupTimeStart,
    returnDate,
    returnTimeEnd,
    hourOptions,
    useBillingDays,
    billingDays,
    getIdToken,
  ]);

  useEffect(() => {
    if (availByDays) {
      const selected = availByDays[String(billingDays)];
      if (!selected) return;
      setWindowAvail(selected);
      setQuantity((q) => {
        const next =
          selected.availableUnits > 0 ? Math.min(q, selected.availableUnits) : q;
        setQuantityDraft(String(next));
        return next;
      });
      return;
    }
    if (!availByHours) return;
    const selected = availByHours[String(loanHours)];
    if (!selected) return;
    setWindowAvail(selected);
    setQuantity((q) => {
      const next =
        selected.availableUnits > 0 ? Math.min(q, selected.availableUnits) : q;
      setQuantityDraft(String(next));
      return next;
    });
    const okHours = hourOptions.filter(
      (h) => (availByHours[String(h)]?.availableUnits ?? 0) > 0
    );
    setViableHours(okHours);
  }, [availByDays, billingDays, availByHours, loanHours, hourOptions]);

  function handlePickupStartChange(value: string) {
    const next = normalizeTimeToHhMm(value) ?? value;
    setPickupTimeStart(next);
    setPickupTimeEnd(addHoursToTime(next, MAX_PICKUP_WINDOW_HOURS));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;

    const pastMsg = "לא ניתן לשמור לעבר — בחרו זמן עתידי";
    let effectivePickupDate = pickupDate;
    let effectivePickupTimeStart = pickupTimeStart;
    let effectivePickupTimeEnd = pickupTimeEnd;
    let effectiveReturnDate = returnDate;
    let effectiveReturnTimeStart = returnTimeStart;
    let effectiveReturnTimeEnd = returnTimeEnd;

    // If the chosen start slipped into the past (stale tab / ASAP default), bump to next slot.
    function bumpToEarliestFuture() {
      const asap = earliestFuturePickup();
      effectivePickupDate = asap.date;
      effectivePickupTimeStart = asap.time;
      effectivePickupTimeEnd = addHoursToTime(asap.time, MAX_PICKUP_WINDOW_HOURS);
      setPickupDate(asap.date);
      setPickupTimeStart(asap.time);
      setPickupTimeEnd(effectivePickupTimeEnd);
      if (!isFixedHours) {
        const pickupMins = parseTimeToMinutes(asap.time) ?? 0;
        const retStartMins = parseTimeToMinutes(effectiveReturnTimeStart) ?? 0;
        if (
          effectiveReturnDate < asap.date ||
          (effectiveReturnDate === asap.date && retStartMins <= pickupMins)
        ) {
          effectiveReturnDate = asap.date;
          effectiveReturnTimeStart = addHoursToTime(asap.time, 4);
          effectiveReturnTimeEnd = addHoursToTime(asap.time, 5);
          setReturnDate(effectiveReturnDate);
          setReturnTimeStart(effectiveReturnTimeStart);
          setReturnTimeEnd(effectiveReturnTimeEnd);
        }
      }
    }

    if (isFixedHours && useBillingDays) {
      let timeError = validateBillingDaysReservation(
        effectivePickupDate,
        effectivePickupTimeStart,
        billingDays
      );
      if (timeError === pastMsg) {
        bumpToEarliestFuture();
        timeError = validateBillingDaysReservation(
          effectivePickupDate,
          effectivePickupTimeStart,
          billingDays
        );
      }
      if (timeError) {
        setError(timeError);
        return;
      }
    } else if (isFixedHours) {
      const limits = {
        minHours: kind.gemachDefaultLoanHours ?? 4,
        maxHours: kind.gemachMaxLoanHours ?? 24,
      };
      let timeError = validateFixedHoursReservation(
        effectivePickupDate,
        effectivePickupTimeStart,
        loanHours,
        limits
      );
      if (timeError === pastMsg) {
        bumpToEarliestFuture();
        timeError = validateFixedHoursReservation(
          effectivePickupDate,
          effectivePickupTimeStart,
          loanHours,
          limits
        );
      }
      if (timeError) {
        setError(timeError);
        return;
      }
    } else {
      let timeError = validateDateRangeReservation({
        pickupDate: effectivePickupDate,
        pickupTimeStart: effectivePickupTimeStart,
        pickupTimeEnd: effectivePickupTimeEnd,
        returnDate: effectiveReturnDate,
        returnTimeStart: effectiveReturnTimeStart,
        returnTimeEnd: effectiveReturnTimeEnd,
      });
      if (timeError === pastMsg) {
        bumpToEarliestFuture();
        timeError = validateDateRangeReservation({
          pickupDate: effectivePickupDate,
          pickupTimeStart: effectivePickupTimeStart,
          pickupTimeEnd: effectivePickupTimeEnd,
          returnDate: effectiveReturnDate,
          returnTimeStart: effectiveReturnTimeStart,
          returnTimeEnd: effectiveReturnTimeEnd,
        });
      }
      if (timeError) {
        setError(timeError);
        return;
      }
    }

    const cap = Math.min(
      windowAvail?.availableUnits ?? kind.availableUnits,
      500
    );
    const parsedQty = Number(quantityDraft);
    const submitQuantity =
      Number.isFinite(parsedQty) && parsedQty > 0
        ? Math.min(Math.floor(parsedQty), Math.max(1, cap))
        : 1;
    setQuantity(submitQuantity);
    setQuantityDraft(String(submitQuantity));

    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      if (!token) {
        router.push("/login");
        return;
      }
      const body = isFixedHours
        ? {
            kindId: kind.catalogId,
            quantity: submitQuantity,
            pickupDate: effectivePickupDate,
            pickupTimeStart: effectivePickupTimeStart,
            ...(useBillingDays
              ? { billingDays }
              : { loanDurationHours: loanHours }),
          }
        : {
            kindId: kind.catalogId,
            quantity: submitQuantity,
            pickupDate: effectivePickupDate,
            pickupTimeStart: effectivePickupTimeStart,
            pickupTimeEnd: effectivePickupTimeEnd,
            returnDate: effectiveReturnDate,
            returnTimeStart: effectiveReturnTimeStart,
            returnTimeEnd: effectiveReturnTimeEnd,
          };

      setGateCode(null);
      const res = await authFetch("/api/reservations", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        if (
          data.code === TERMS_REQUIRED_CODE ||
          data.code === MEMBERSHIP_REQUIRED_CODE ||
          data.code === PEER_DEBT_REQUIRED_CODE
        ) {
          setGateCode(data.code);
          return;
        }
        throw new Error(data.error ?? "השריון נכשל");
      }

      await res.json();
      router.push("/my-reservations?created=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (!kind || authLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (!kind.isPartnerGemach && !isPaidMember(member)) {
    return (
      <div className="mx-auto max-w-md">
        <BackLink href={`/tools/${kind.catalogId}`}>חזרה ל{kind.name}</BackLink>
        <Card>
          <CardBody className="py-6">
            <h1 className="mb-4 text-2xl font-bold text-stone-900">שריון {kind.name}</h1>
            <JoinMembershipBanner reason={MEMBERSHIP_REQUIRED_CODE} />
          </CardBody>
        </Card>
      </div>
    );
  }

  const today = israelNowParts().date;
  const stockLabel = inventoryLabel(kind);
  const billedDays = useBillingDays ? billingDays : 1;
  const dayFee = Math.max(0, kind.loanFeeMin) * quantity;
  const totalFee = dayFee * billedDays;
  const priceText =
    !kind.isPartnerGemach && dayFee > 0
      ? formatCredits(totalFee)
      : (kind.priceLabel ?? "—");
  const maxQuantity = Math.min(
    windowAvail?.availableUnits ?? kind.availableUnits,
    500
  );
  const windowBlocked =
    Boolean(windowAvail) && (windowAvail?.availableUnits ?? 0) < quantity;
  const displayedHours =
    viableHours && viableHours.length > 0 ? viableHours : hourOptions;

  return (
    <div className="mx-auto max-w-md">
      <BackLink href={`/tools/${kind.catalogId}`}>חזרה ל{kind.name}</BackLink>

      <Card>
        <div className="h-1 bg-kerem-600" />
        <CardBody className="py-6">
          <h1 className="text-2xl font-bold text-stone-900">שריון {kind.name}</h1>
          {extending && (
            <Alert variant="info" className="mt-3">
              הארכת השאלה פעילה — שריון חדש (חיוב נפרד) מתחיל בתום ההשאלה הנוכחית, בלי להחזיר את הכלי בינתיים.
            </Alert>
          )}
          <p className="mt-2 text-sm text-[var(--muted)]">
            {isFixedHours
              ? `בחרו מתי לקחת ולכמה זמן. שריון עתידי לא נועל את המלאי מיד — אפשר להשאיל עד ${RESERVATION_HARD_LOCK_HOURS} שעה לפני הלקיחה הבאה.`
              : `בחרו חלונות איסוף והחזרה. שריון עתידי משאיר את הכלים זמינים עד ${RESERVATION_HARD_LOCK_HOURS} שעה לפני האיסוף.`}
          </p>
          {kind.gemachName && (
            <p className="mt-1 text-xs font-medium text-accent-800">
              {kind.gemachName}
            </p>
          )}
          {stockLabel && kind.availableUnits > 0 && (
            <p className="mt-2 text-sm font-medium text-kerem-700">{stockLabel}</p>
          )}
          {windowAvail && windowAvail.reservedForFuture > 0 && (
            <p className="mt-1 text-xs text-amber-800">
              {windowAvail.reservedForFuture} יחידות שמורות לעתיד — עדיין זמינות
              להשאלה עד שעה לפני הלקיחה שלהן.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {kind.totalUnits > 1 && (
              <div>
                <label htmlFor="quantity" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  כמות יחידות
                </label>
                <input
                  id="quantity"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={quantityDraft}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, "");
                    setQuantityDraft(raw);
                    if (raw === "") return;
                    const n = Number(raw);
                    if (Number.isFinite(n) && n > 0) setQuantity(n);
                  }}
                  onBlur={() => {
                    const cap = Math.max(1, maxQuantity);
                    const n = Number(quantityDraft);
                    const next =
                      Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), cap) : 1;
                    setQuantity(next);
                    setQuantityDraft(String(next));
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {availLoading
                    ? "בודק זמינות לחלון שנבחר…"
                    : windowAvail
                      ? `עד ${maxQuantity} יחידות זמינות בחלון זה (${windowAvail.lendableNow} זמינים עכשיו במלאי)`
                      : `עד ${Math.min(kind.availableUnits, 500)} יחידות זמינות עכשיו`}
                </p>
              </div>
            )}
            {isFixedHours ? (
              <>
                <fieldset className="space-y-3 rounded-xl border border-warm-200 bg-warm-50/70 p-4">
                  <legend className="px-1 text-sm font-bold text-stone-900">
                    תחילת השאלה
                  </legend>
                  <div>
                    <label htmlFor="pickupDate" className="mb-1.5 block text-sm font-semibold text-stone-800">
                      תאריך
                    </label>
                    <input
                      id="pickupDate"
                      type="date"
                      min={today}
                      required
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="pickupTimeStart" className="mb-1.5 block text-sm font-semibold text-stone-800">
                      שעת התחלה
                    </label>
                    <input
                      id="pickupTimeStart"
                      type="time"
                      step="60"
                      required
                      value={pickupTimeStart}
                      onChange={(e) => handlePickupStartChange(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                    />
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      ברירת מחדל: הדקה הקרובה ביותר שאפשר לשריין
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor={useBillingDays ? "billingDays" : "loanHours"}
                      className="mb-1.5 block text-sm font-semibold text-stone-800"
                    >
                      משך השאלה
                    </label>
                    {useBillingDays ? (
                      <>
                        <select
                          id="billingDays"
                          value={billingDays}
                          onChange={(e) => setBillingDays(Number(e.target.value))}
                          className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                        >
                          {Array.from({ length: MAX_RESERVATION_BILLING_DAYS }, (_, i) => i + 1).map(
                            (d) => (
                              <option key={d} value={d}>
                                {formatBillingDaysLabel(d)}
                              </option>
                            )
                          )}
                        </select>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          יום חיוב נספר מ-22:00 עד 22:00 למחרת. מקסימום {MAX_RESERVATION_BILLING_DAYS}{" "}
                          ימים בהזמנה אחת.
                        </p>
                      </>
                    ) : (
                      <>
                        <select
                          id="loanHours"
                          value={loanHours}
                          onChange={(e) => setLoanHours(Number(e.target.value))}
                          className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                        >
                          {displayedHours.map((h) => (
                            <option key={h} value={h}>
                              {formatLoanDurationLabel(h)}
                            </option>
                          ))}
                        </select>
                        {viableHours && viableHours.length < hourOptions.length && (
                          <p className="mt-1 text-xs text-amber-800">
                            משכים ארוכים יותר נחסמו כי הם חופפים לשריון/השאלה קיימים.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </fieldset>

                {fixedSchedule && (
                  <div className="rounded-xl border border-kerem-200 bg-kerem-50/50 p-4 text-sm">
                    <p className="font-bold text-stone-900">סיכום השריון</p>
                    <p className="mt-2 text-[var(--muted)]">
                      <span className="font-medium text-stone-800">משך:</span>{" "}
                      {useBillingDays
                        ? formatBillingDaysLabel(billingDays)
                        : formatLoanDurationLabel(loanHours)}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      <span className="font-medium text-stone-800">מתחיל:</span>{" "}
                      {formatDateHe(fixedSchedule.pickupDate)} · {fixedSchedule.pickupTimeStart}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      <span className="font-medium text-stone-800">החזרה עד:</span>{" "}
                      {formatDateHe(fixedSchedule.returnDate)} · {fixedSchedule.returnTimeEnd}
                    </p>
                    {windowAvail && (
                      <p className="mt-2 font-medium text-kerem-900">
                        {availLoading
                          ? "בודק זמינות…"
                          : `${windowAvail.availableUnits} יחידות פנויות בחלון זה`}
                      </p>
                    )}
                    {windowAvail?.nextHold && (
                      <p className="mt-2 text-xs leading-relaxed text-amber-900">
                        השריון/השאלה הבאים ננעלים ב־{windowAvail.nextHold.hardLockAtLabel}
                        {windowAvail.nextHold.quantity > 1
                          ? ` (${windowAvail.nextHold.quantity} יחידות)`
                          : ""}
                        . צריך להחזיר עד שעה לפני הלקיחה הזו.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <fieldset className="space-y-3 rounded-xl border border-warm-200 bg-warm-50/70 p-4">
                  <legend className="px-1 text-sm font-bold text-stone-900">חלון איסוף</legend>
                  <div>
                    <label htmlFor="pickupDate" className="mb-1.5 block text-sm font-semibold text-stone-800">
                      תאריך
                    </label>
                    <input
                      id="pickupDate"
                      type="date"
                      min={today}
                      required
                      value={pickupDate}
                      onChange={(e) => {
                        setPickupDate(e.target.value);
                        if (returnDate && returnDate < e.target.value) {
                          setReturnDate(e.target.value);
                        }
                      }}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pickupTimeStart" className="mb-1.5 block text-sm font-semibold text-stone-800">
                        משעה
                      </label>
                      <input
                        id="pickupTimeStart"
                        type="time"
                        step="60"
                        required
                        value={pickupTimeStart}
                        onChange={(e) => handlePickupStartChange(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                      />
                    </div>
                    <div>
                      <label htmlFor="pickupTimeEnd" className="mb-1.5 block text-sm font-semibold text-stone-800">
                        עד שעה
                      </label>
                      <input
                        id="pickupTimeEnd"
                        type="time"
                        step="60"
                        required
                        value={pickupTimeEnd}
                        onChange={(e) =>
                          setPickupTimeEnd(normalizeTimeToHhMm(e.target.value) ?? e.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3 rounded-xl border border-kerem-200 bg-kerem-50/40 p-4">
                  <legend className="px-1 text-sm font-bold text-stone-900">חלון החזרה</legend>
                  <div>
                    <label htmlFor="returnDate" className="mb-1.5 block text-sm font-semibold text-stone-800">
                      תאריך
                    </label>
                    <input
                      id="returnDate"
                      type="date"
                      min={pickupDate || today}
                      required
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="returnTimeStart" className="mb-1.5 block text-sm font-semibold text-stone-800">
                        משעה
                      </label>
                      <input
                        id="returnTimeStart"
                        type="time"
                        step="60"
                        required
                        value={returnTimeStart}
                        onChange={(e) =>
                          setReturnTimeStart(normalizeTimeToHhMm(e.target.value) ?? e.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                      />
                    </div>
                    <div>
                      <label htmlFor="returnTimeEnd" className="mb-1.5 block text-sm font-semibold text-stone-800">
                        עד שעה
                      </label>
                      <input
                        id="returnTimeEnd"
                        type="time"
                        step="60"
                        required
                        value={returnTimeEnd}
                        onChange={(e) =>
                          setReturnTimeEnd(normalizeTimeToHhMm(e.target.value) ?? e.target.value)
                        }
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                      />
                    </div>
                  </div>
                </fieldset>

                {windowAvail && (
                  <div className="rounded-xl border border-kerem-200 bg-kerem-50/50 p-4 text-sm">
                    <p className="font-medium text-kerem-900">
                      {availLoading
                        ? "בודק זמינות…"
                        : `${windowAvail.availableUnits} יחידות פנויות בחלון זה`}
                    </p>
                    {windowAvail.nextHold && (
                      <p className="mt-2 text-xs leading-relaxed text-amber-900">
                        השריון/השאלה הבאים ננעלים ב־{windowAvail.nextHold.hardLockAtLabel}
                        . צריך להחזיר עד שעה לפני הלקיחה הזו.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <div className="rounded-xl bg-kerem-50 p-4 ring-1 ring-kerem-200">
              <p className="text-xs font-semibold text-kerem-700">
                {kind.gemachPricingMode === "free" ? "מחיר" : "דמי השאלה המשוערים"}
              </p>
              <p className="mt-1 text-xl font-bold text-kerem-800">{priceText}</p>
              {!kind.isPartnerGemach && (
                <p className="mt-1 text-xs text-kerem-800">
                  {dayFee > 0
                    ? billedDays > 1
                      ? `${formatCredits(dayFee)} ליום × ${billedDays} ימים. הארכה ליום נוסף תחויב בנפרד. `
                      : "לחיוב ליום. הארכה ליום נוסף תחויב בנפרד מהיתרה. "
                    : ""}
                  החיוב מהיתרה מתבצע רק בלקיחה בפועל. ביטול שריון לא מוריד כסף.
                </p>
              )}
            </div>

            {windowBlocked && (
              <Alert variant="warning">
                אין מספיק יחידות פנויות בחלון הזמן שנבחר. קצרו את משך ההשאלה, הזיזו
                תאריך, או הפחיתו כמות.
              </Alert>
            )}
            {error && !gateCode && <Alert variant="error">{error}</Alert>}
            {gateCode === PEER_DEBT_REQUIRED_CODE ? (
              <PeerDebtBanner />
            ) : (
              gateCode && <JoinMembershipBanner reason={gateCode} />
            )}

            <Button
              type="submit"
              disabled={
                loading ||
                !pickupDate ||
                !pickupTimeStart ||
                (!isFixedHours && !returnDate) ||
                windowBlocked ||
                (isFixedHours && displayedHours.length === 0)
              }
              className="w-full"
              size="lg"
            >
              {loading ? "שומר…" : "אישור שריון"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
