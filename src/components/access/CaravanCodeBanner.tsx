"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { isBoardMember } from "@/lib/admin";
import { isPaidMember } from "@/lib/membership";

export function CaravanCodeBanner() {
  const { getIdToken, member } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await authFetch("/api/access-codes?scope=caravan", { token });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.caravanCode === "string" && data.caravanCode) {
          setCode(data.caravanCode);
        }
      } catch {
        // Banner is optional — ignore failures.
      }
    }
    load();
  }, [getIdToken]);

  if (!code) return null;

  const canSeeClub = Boolean(member && (isPaidMember(member) || isBoardMember(member)));

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
      <div>
        <p className="text-xs font-bold text-[var(--muted)]">קוד קרוואן</p>
        <p className="mt-0.5 font-mono text-lg font-bold tracking-[0.28em] text-stone-900" dir="ltr">
          {revealed ? code : "••••••"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="rounded-xl border border-[var(--border)] bg-warm-50 px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-warm-100"
        >
          {revealed ? "הסתרה" : "הצגה"}
        </button>
        {canSeeClub && (
          <Link
            href="/access"
            className="text-sm font-semibold text-kerem-800 underline-offset-2 hover:underline"
          >
            חדר המועדון
          </Link>
        )}
      </div>
    </div>
  );
}
