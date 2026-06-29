"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";

interface InstantLoanButtonProps {
  kindId: string;
  /** Compact styling for catalog cards (vs. the large tool-detail button). */
  compact?: boolean;
  /** Units available now — enables a quantity selector when greater than 1. */
  availableUnits?: number;
}

export function InstantLoanButton({
  kindId,
  compact,
  availableUnits = 1,
}: InstantLoanButtonProps) {
  const router = useRouter();
  const { user, getIdToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const maxQuantity = Math.min(Math.max(1, availableUnits), 500);
  const canChooseQuantity = maxQuantity > 1;

  function clampQuantity(value: number) {
    if (!Number.isFinite(value) || value < 1) return 1;
    return Math.min(Math.floor(value), maxQuantity);
  }

  function handleTrigger() {
    setError("");
    if (!user) {
      router.push("/login");
      return;
    }
    if (canChooseQuantity) {
      setQuantity((q) => clampQuantity(q));
      setChoosing(true);
      return;
    }
    void book(1);
  }

  async function book(qty: number) {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/reservations", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kindId, quantity: qty, immediate: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "לא ניתן להתחיל השאלה מיידית");
      }
      router.push(`/checkout/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
      setLoading(false);
    }
  }

  // ── Quantity chooser (shown after clicking when more than one unit is free) ──
  if (choosing) {
    return (
      <div
        className={
          compact
            ? "flex w-full flex-col gap-2 rounded-xl border border-kerem-200 bg-kerem-50/60 p-3"
            : "flex-1 rounded-xl border border-kerem-200 bg-kerem-50/60 p-4 sm:flex-none"
        }
      >
        <p className="text-sm font-semibold text-stone-800">
          כמה יחידות לקחת?{" "}
          <span className="font-normal text-[var(--muted)]">(עד {maxQuantity})</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setQuantity((q) => clampQuantity(q - 1))}
            disabled={quantity <= 1}
            className="h-10 w-10 rounded-xl border border-[var(--border)] bg-white text-lg font-bold text-stone-700 disabled:opacity-40"
            aria-label="פחות"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            max={maxQuantity}
            value={quantity}
            aria-label="כמות יחידות"
            onChange={(e) => setQuantity(clampQuantity(Number(e.target.value)))}
            className="h-10 w-16 rounded-xl border border-[var(--border)] bg-white text-center text-base font-semibold focus:border-kerem-400 focus:outline-none focus:ring-2 focus:ring-kerem-200"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => clampQuantity(q + 1))}
            disabled={quantity >= maxQuantity}
            className="h-10 w-10 rounded-xl border border-[var(--border)] bg-white text-lg font-bold text-stone-700 disabled:opacity-40"
            aria-label="עוד"
          >
            +
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => book(quantity)}
            disabled={loading}
            className="flex-1 rounded-xl bg-kerem-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-kerem-800 disabled:opacity-60"
          >
            {loading ? "מתחיל…" : `⚡ קח ${quantity} ועבור לתשלום`}
          </button>
          <button
            type="button"
            onClick={() => {
              setChoosing(false);
              setError("");
            }}
            disabled={loading}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-stone-600 hover:bg-warm-50 disabled:opacity-60"
          >
            ביטול
          </button>
        </div>
        {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      </div>
    );
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={loading}
          className="rounded-xl border border-kerem-300 bg-white px-3 py-2 text-sm font-semibold text-kerem-800 shadow-sm transition hover:bg-kerem-50 disabled:opacity-60"
        >
          {loading ? "מתחיל…" : "⚡ מיידית"}
        </button>
        {error && (
          <p className="w-full text-right text-xs font-medium text-red-700">{error}</p>
        )}
      </>
    );
  }

  return (
    <div className="flex-1 sm:flex-none">
      <button
        type="button"
        onClick={handleTrigger}
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-xl border border-kerem-300 bg-white py-3.5 text-base font-bold text-kerem-800 shadow-sm transition hover:bg-kerem-50 disabled:opacity-60 sm:px-8"
      >
        {loading ? "מתחיל…" : "⚡ השאלה מיידית"}
      </button>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
