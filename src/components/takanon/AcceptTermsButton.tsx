"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { hasAcceptedTerms } from "@/lib/membership";

export function AcceptTermsButton() {
  const { user, member, loading, getIdToken, refreshMember } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (loading) return null;

  if (!user) {
    return (
      <p className="text-center text-sm text-[var(--muted)]">
        התחברו כדי לאשר את התקנון בחשבון שלכם.
      </p>
    );
  }

  if (hasAcceptedTerms(member)) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
        אישרתם את התקנון
        {member?.termsAcceptedAt
          ? ` · ${new Date(member.termsAcceptedAt).toLocaleDateString("he-IL")}`
          : ""}
      </p>
    );
  }

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
    <div className="space-y-3">
      <button
        type="button"
        disabled={saving}
        onClick={accept}
        className="w-full rounded-xl bg-kerem-700 px-4 py-3 text-sm font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
      >
        {saving ? "מאשר…" : "אני מאשר/ת כי קראתי את התקנון ומסכים/ה לתנאיו"}
      </button>
      {error && <p className="text-center text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}
