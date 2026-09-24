"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { hasAcceptedTerms } from "@/lib/membership";

const PUBLIC_PATHS = ["/login", "/takanon"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Mandatory תקנון acceptance. Paid members skipped the join offer, so without
 * this gate they could browse forever and then fail silently on reserve.
 */
export function TermsGate({ children }: { children: React.ReactNode }) {
  const { user, member, configured, getIdToken, refreshMember } = useAuth();
  const pathname = usePathname();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsTerms =
    configured &&
    !!user &&
    !!member &&
    !!member.nameCompleted &&
    !!member.phone &&
    !hasAcceptedTerms(member) &&
    !isPublicPath(pathname);

  if (!needsTerms) return <>{children}</>;

  async function accept() {
    setSaving(true);
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
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-stone-900">אישור תקנון</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          לפני השאלה או שריון כלי מהקואופרטיב חובה לקרוא ולאשר את התקנון. בלי אישור
          לא ניתן להמשיך.
        </p>

        <Link
          href="/takanon"
          className="mt-4 inline-block text-sm font-semibold text-kerem-700 underline hover:text-kerem-800"
        >
          קריאת התקנון המלא
        </Link>

        {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}

        <button
          type="button"
          disabled={saving}
          onClick={accept}
          className="mt-5 w-full rounded-xl bg-kerem-700 px-4 py-3 text-sm font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
        >
          {saving ? "מאשר…" : "קראתי ומאשר/ת את התקנון"}
        </button>
      </div>
    </div>
  );
}
