"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { inventoryLabel } from "@/lib/tool-kinds";
import {
  computeFixedHoursReservation,
  DEFAULT_PICKUP_START,
  DEFAULT_RETURN_END,
  DEFAULT_RETURN_START,
  formatLoanDurationLabel,
  MAX_PICKUP_WINDOW_HOURS,
  validateDateRangeReservation,
  validateFixedHoursReservation,
  addHoursToTime,
} from "@/lib/reservation-times";
import { formatDateHe } from "@/lib/dates";
import { BackLink } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { GemachReservationMode, ToolKindWithAvailability } from "@/lib/types";
import { LOAN_HOUR_CANDIDATES } from "@/lib/gemach";

function loanHourOptions(kind: ToolKindWithAvailability): number[] {
  const min = kind.gemachDefaultLoanHours ?? 4;
  const max = kind.gemachMaxLoanHours ?? 24;
  const candidates = LOAN_HOUR_CANDIDATES.filter((h) => h >= min && h <= max);
  if (!candidates.includes(min)) candidates.unshift(min);
  if (!candidates.includes(max)) candidates.push(max);
  return [...new Set(candidates)].sort((a, b) => a - b);
}

export default function ReserveToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [kind, setKind] = useState<ToolKindWithAvailability | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const mode: GemachReservationMode = kind?.gemachReservationMode ?? "fixed_hours";
  const isFixedHours = mode === "fixed_hours";

  const [pickupDate, setPickupDate] = useState("");
  const [pickupTimeStart, setPickupTimeStart] = useState(DEFAULT_PICKUP_START);
  const [loanHours, setLoanHours] = useState(4);
  const [pickupTimeEnd, setPickupTimeEnd] = useState(
    addHoursToTime(DEFAULT_PICKUP_START, MAX_PICKUP_WINDOW_HOURS)
  );
  const [returnDate, setReturnDate] = useState("");
  const [returnTimeStart, setReturnTimeStart] = useState(DEFAULT_RETURN_START);
  const [returnTimeEnd, setReturnTimeEnd] = useState(DEFAULT_RETURN_END);

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
    fetch(`/api/tools/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("הכלי לא נמצא");
        return res.json();
      })
      .then(setKind)
      .catch((err) => setLoadError(err.message));
  }, [params.id]);

  const fixedSchedule = useMemo(() => {
    if (!isFixedHours || !pickupDate || !pickupTimeStart) return null;
    try {
      return computeFixedHoursReservation(pickupDate, pickupTimeStart, loanHours);
    } catch {
      return null;
    }
  }, [isFixedHours, pickupDate, pickupTimeStart, loanHours]);

  function handlePickupStartChange(value: string) {
    setPickupTimeStart(value);
    setPickupTimeEnd(addHoursToTime(value, MAX_PICKUP_WINDOW_HOURS));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;

    if (isFixedHours) {
      const timeError = validateFixedHoursReservation(pickupDate, pickupTimeStart, loanHours, {
        minHours: kind.gemachDefaultLoanHours ?? 4,
        maxHours: kind.gemachMaxLoanHours ?? 24,
      });
      if (timeError) {
        setError(timeError);
        return;
      }
    } else {
      const timeError = validateDateRangeReservation({
        pickupDate,
        pickupTimeStart,
        pickupTimeEnd,
        returnDate,
        returnTimeStart,
        returnTimeEnd,
      });
      if (timeError) {
        setError(timeError);
        return;
      }
    }

    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const body = isFixedHours
        ? {
            kindId: kind.catalogId,
            pickupDate,
            pickupTimeStart,
            loanDurationHours: loanHours,
          }
        : {
            kindId: kind.catalogId,
            pickupDate,
            pickupTimeStart,
            pickupTimeEnd,
            returnDate,
            returnTimeStart,
            returnTimeEnd,
          };

      const res = await authFetch("/api/reservations", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
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
  if (!kind) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const stockLabel = inventoryLabel(kind);
  const priceText = kind.priceLabel ?? "—";

  return (
    <div className="mx-auto max-w-md">
      <BackLink href={`/tools/${kind.catalogId}`}>חזרה ל{kind.name}</BackLink>

      <Card className="shadow-md">
        <div className="h-1.5 bg-gradient-to-l from-kerem-500 to-kerem-700" />
        <CardBody className="py-6">
          <h1 className="text-2xl font-bold text-stone-900">שמירת {kind.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {isFixedHours
              ? `בחרו מתי מתחילים — ברירת מחדל ${kind.gemachDefaultLoanHours ?? 4} שעות, עד ${kind.gemachMaxLoanHours ?? 24} שעות.`
              : "בחרו חלונות איסוף והחזרה — מתאים להשאלות ארוכות יותר."}
          </p>
          {kind.gemachName && (
            <p className="mt-1 text-xs font-medium text-amber-800">
              {kind.isPartnerGemach ? `★ ${kind.gemachName}` : kind.gemachName}
            </p>
          )}
          {stockLabel && kind.availableUnits > 0 && (
            <p className="mt-2 text-sm font-medium text-sky-700">{stockLabel}</p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {isFixedHours ? (
              <>
                <fieldset className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                  <legend className="px-1 text-sm font-bold text-stone-900">
                    📅 תחילת השאלה
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
                      required
                      value={pickupTimeStart}
                      onChange={(e) => setPickupTimeStart(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="loanHours" className="mb-1.5 block text-sm font-semibold text-stone-800">
                      משך השאלה
                    </label>
                    <select
                      id="loanHours"
                      value={loanHours}
                      onChange={(e) => setLoanHours(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                    >
                      {hourOptions.map((h) => (
                        <option key={h} value={h}>
                          {formatLoanDurationLabel(h)}
                        </option>
                      ))}
                    </select>
                  </div>
                </fieldset>

                {fixedSchedule && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-sm">
                    <p className="font-bold text-stone-900">סיכום השמירה</p>
                    <p className="mt-2 text-[var(--muted)]">
                      <span className="font-medium text-stone-800">משך:</span>{" "}
                      {formatLoanDurationLabel(loanHours)}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      <span className="font-medium text-stone-800">מתחיל:</span>{" "}
                      {formatDateHe(fixedSchedule.pickupDate)} · {fixedSchedule.pickupTimeStart}
                    </p>
                    <p className="mt-1 text-[var(--muted)]">
                      <span className="font-medium text-stone-800">החזרה עד:</span>{" "}
                      {formatDateHe(fixedSchedule.returnDate)} · {fixedSchedule.returnTimeEnd}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <fieldset className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                  <legend className="px-1 text-sm font-bold text-stone-900">📅 חלון איסוף</legend>
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
                        required
                        value={pickupTimeEnd}
                        onChange={(e) => setPickupTimeEnd(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
                  <legend className="px-1 text-sm font-bold text-stone-900">🔁 חלון החזרה</legend>
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
                        required
                        value={returnTimeStart}
                        onChange={(e) => setReturnTimeStart(e.target.value)}
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
                        required
                        value={returnTimeEnd}
                        onChange={(e) => setReturnTimeEnd(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                      />
                    </div>
                  </div>
                </fieldset>
              </>
            )}

            <div className="rounded-xl bg-kerem-50 p-4 ring-1 ring-kerem-200">
              <p className="text-xs font-semibold text-kerem-700">
                {kind.gemachPricingMode === "free" ? "מחיר" : "דמי השאלה המשוערים"}
              </p>
              <p className="mt-1 text-xl font-bold text-kerem-800">{priceText}</p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <Button
              type="submit"
              disabled={
                loading ||
                !pickupDate ||
                !pickupTimeStart ||
                (!isFixedHours && !returnDate) ||
                kind.availableUnits === 0
              }
              className="w-full"
              size="lg"
            >
              {loading ? "שומר…" : "אישור שמירה"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
