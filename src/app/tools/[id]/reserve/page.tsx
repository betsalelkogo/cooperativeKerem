"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { inventoryLabel } from "@/lib/tool-kinds";
import { BackLink } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { ToolKindWithAvailability } from "@/lib/types";

export default function ReserveToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [kind, setKind] = useState<ToolKindWithAvailability | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/tools/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("הכלי לא נמצא");
        return res.json();
      })
      .then(setKind)
      .catch((err) => setLoadError(err.message));
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/reservations", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kindId: kind.catalogId,
          pickupDate,
          returnDate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "השריון נכשל");
      }

      const reservation = await res.json();
      router.push(`/checkout/${reservation.id}`);
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
          <h1 className="text-2xl font-bold text-stone-900">שריון {kind.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            בחרו מתי תאספו את הכלי ומתי תחזירו אותו.
          </p>
          {stockLabel && kind.availableUnits > 0 && (
            <p className="mt-2 text-sm font-medium text-sky-700">{stockLabel}</p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="pickupDate" className="mb-2 block text-sm font-semibold text-stone-800">
                📅 תאריך איסוף מתוכנן
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
                className="w-full rounded-xl border border-[var(--border)] bg-warm-50/50 px-4 py-3 text-sm transition focus:border-kerem-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label htmlFor="returnDate" className="mb-2 block text-sm font-semibold text-stone-800">
                🔁 תאריך החזרה מתוכנן
              </label>
              <input
                id="returnDate"
                type="date"
                min={pickupDate || today}
                required
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-warm-50/50 px-4 py-3 text-sm transition focus:border-kerem-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
              <p className="mt-2 text-xs text-[var(--muted)]">
                הכלי יוצג לאחרים כלא זמין עד תאריך זה.
              </p>
            </div>

            <div className="rounded-xl bg-kerem-50 p-4 ring-1 ring-kerem-200">
              <p className="text-xs font-semibold text-kerem-700">
                {kind.gemachPricingMode === "free" ? "מחיר" : "דמי השאלה המשוערים"}
              </p>
              <p className="mt-1 text-xl font-bold text-kerem-800">{priceText}</p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <Button
              type="submit"
              disabled={loading || !pickupDate || !returnDate || kind.availableUnits === 0}
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
