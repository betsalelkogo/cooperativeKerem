"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { isValidPhone } from "@/lib/phone";

const PUBLIC_PATHS = ["/login", "/takanon"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function PhoneGate({ children }: { children: React.ReactNode }) {
  const { user, member, configured, getIdToken, refreshMember } = useAuth();
  const pathname = usePathname();
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsPhone =
    configured && !!user && !!member && !member.phone && !isPublicPath(pathname);

  if (!needsPhone) return <>{children}</>;

  async function save() {
    if (!isValidPhone(phone)) {
      setError("יש להזין מספר טלפון תקין");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/account/phone", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירת המספר נכשלה");
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
        <h2 className="text-lg font-bold text-stone-900">הוספת מספר טלפון</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          כדי להשלים את ההרשמה, יש להזין את מספר הטלפון הנייד שלך. המספר משמש לזיהוי
          תשלומים שביצעת ב-PayBox.
        </p>

        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) save();
          }}
          placeholder="0501234567"
          className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-center text-lg tracking-widest"
        />

        {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}

        <button
          type="button"
          disabled={saving || !phone}
          onClick={save}
          className="mt-4 w-full rounded-xl bg-kerem-700 px-4 py-3 text-sm font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
        >
          {saving ? "שומר…" : "שמירה והמשך"}
        </button>
      </div>
    </div>
  );
}
