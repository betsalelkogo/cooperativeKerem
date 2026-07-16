"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import {
  hasAcceptedTerms,
  isPaidMember,
  MEMBERSHIP_JOIN_MIN_NIS,
  MEMBERSHIP_REQUIRED_CODE,
  TERMS_REQUIRED_CODE,
} from "@/lib/membership";

interface JoinMembershipBannerProps {
  /** Error code from a failed reservation (TERMS_REQUIRED / MEMBERSHIP_REQUIRED). */
  reason?: string | null;
  className?: string;
}

/**
 * Shown when a non-member hits a borrow gate, or as a soft reminder on account.
 * Paid members (`isAmember`) never see this.
 */
export function JoinMembershipBanner({
  reason,
  className = "",
}: JoinMembershipBannerProps) {
  const { member, getIdToken, refreshMember } = useAuth();
  const [payboxUrl, setPayboxUrl] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!member || isPaidMember(member)) return;
    let cancelled = false;
    fetch("/api/paybox/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const url =
          typeof data.operationsGroupUrl === "string" ? data.operationsGroupUrl : "";
        setPayboxUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [member]);

  if (!member || isPaidMember(member)) return null;

  const termsOk = hasAcceptedTerms(member);
  const needsTerms =
    reason === TERMS_REQUIRED_CODE || (!termsOk && reason !== MEMBERSHIP_REQUIRED_CODE);
  const needsMembership =
    reason === MEMBERSHIP_REQUIRED_CODE || reason === TERMS_REQUIRED_CODE || !reason;

  async function acceptTerms() {
    setAccepting(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/account/terms", { method: "POST", token });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "אישור התקנון נכשל");
      await refreshMember();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setAccepting(false);
    }
  }

  const title =
    reason === TERMS_REQUIRED_CODE
      ? "נדרש אישור תקנון לפני השאלה"
      : reason === MEMBERSHIP_REQUIRED_CODE
        ? "נדרשת חברות בקואופרטיב להשאלת כלי זה"
        : "הצטרפות לקואופרטיב";

  return (
    <div
      className={`rounded-xl border border-kerem-200 bg-kerem-50/70 p-4 ${className}`}
    >
      <p className="text-sm font-bold text-stone-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        אפשר לגלוש ולהשתמש בגמ״חים שותפים בלי תשלום. להשאלת כלי מהקואופרטיב — אשרו את
        התקנון ושלמו דמי הצטרפות (מ־₪{MEMBERSHIP_JOIN_MIN_NIS}). לאחר התשלום מנהל יאשר
        את החברות.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {needsTerms && (
          <>
            <Link
              href="/takanon"
              className="text-xs font-medium text-kerem-700 underline hover:text-kerem-800"
            >
              תקנון
            </Link>
            {termsOk ? (
              <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                תקנון אושר
              </span>
            ) : (
              <button
                type="button"
                disabled={accepting}
                onClick={acceptTerms}
                className="rounded-lg bg-kerem-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
              >
                {accepting ? "מאשר…" : "אישור תקנון"}
              </button>
            )}
          </>
        )}
        {needsMembership && payboxUrl && (
          <a
            href={payboxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-kerem-300 bg-white px-3 py-1.5 text-xs font-semibold text-kerem-800 hover:bg-kerem-50"
          >
            תשלום בפייבוקס
          </a>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
