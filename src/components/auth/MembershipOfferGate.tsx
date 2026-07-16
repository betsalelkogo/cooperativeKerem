"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import {
  hasAcceptedTerms,
  isPaidMember,
  MEMBERSHIP_JOIN_MIN_NIS,
} from "@/lib/membership";

const PUBLIC_PATHS = ["/login", "/takanon"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Optional end-of-signup step: תקנון + PayBox join link.
 * Skipped for paid members (`isAmember`). Dismissible — browse continues without joining.
 */
export function MembershipOfferGate({ children }: { children: React.ReactNode }) {
  const { user, member, configured, getIdToken, refreshMember } = useAuth();
  const pathname = usePathname();
  const [payboxUrl, setPayboxUrl] = useState("");
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState("");

  const showOffer =
    configured &&
    !!user &&
    !!member &&
    !!member.nameCompleted &&
    !!member.phone &&
    !isPaidMember(member) &&
    !member.membershipOfferDismissedAt &&
    !isPublicPath(pathname);

  useEffect(() => {
    if (!showOffer) return;
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
  }, [showOffer]);

  if (!showOffer) return <>{children}</>;

  const termsOk = hasAcceptedTerms(member);

  async function acceptTerms() {
    setAcceptingTerms(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/account/terms", {
        method: "POST",
        token,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "אישור התקנון נכשל");
      await refreshMember();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setAcceptingTerms(false);
    }
  }

  async function dismiss() {
    setDismissing(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/account/membership-offer", {
        method: "POST",
        token,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "הפעולה נכשלה");
      await refreshMember();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setDismissing(false);
    }
  }

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-stone-900">הצטרפות לקואופרטיב</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            אפשר כבר עכשיו לגלוש במלאי של כל הגמ״חים, להשתמש בגמ״חים שותפים, ולראות מה
            הקואופרטיב מציע. אישור התקנון ותשלום דמי הצטרפות (מ־₪{MEMBERSHIP_JOIN_MIN_NIS})
            נדרשים רק לפני השאלת כלי מהקואופרטיב — לא כדי להמשיך.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-warm-50/80 p-4">
              <p className="text-sm font-semibold text-stone-900">1. תקנון</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                מומלץ לקרוא ולאשר כבר עכשיו — חובה לפני ההשאלה הראשונה.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href="/takanon"
                  className="text-sm font-medium text-kerem-700 underline hover:text-kerem-800"
                >
                  צפייה בתקנון
                </Link>
                {termsOk ? (
                  <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    אושר
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={acceptingTerms}
                    onClick={acceptTerms}
                    className="rounded-lg bg-kerem-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
                  >
                    {acceptingTerms ? "מאשר…" : "אני מאשר/ת את התקנון"}
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-warm-50/80 p-4">
              <p className="text-sm font-semibold text-stone-900">2. תשלום בפייבוקס</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                לאחר התשלום מנהל יאשר את החברות במערכת. עד אז אפשר להמשיך לגלוש.
              </p>
              {payboxUrl ? (
                <a
                  href={payboxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-lg bg-kerem-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-kerem-800"
                >
                  מעבר לתשלום בפייבוקס
                </a>
              ) : (
                <p className="mt-3 text-xs font-medium text-amber-800">
                  קישור התשלום יפורסם בקרוב — פנו למנהל להצטרפות.
                </p>
              )}
            </div>
          </div>

          {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

          <button
            type="button"
            disabled={dismissing}
            onClick={dismiss}
            className="mt-5 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-stone-800 hover:bg-warm-50 disabled:opacity-50"
          >
            {dismissing ? "ממשיך…" : "המשך לגלישה בלי הצטרפות כרגע"}
          </button>
        </div>
      </div>
    </>
  );
}
