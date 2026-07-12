"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { isValidNamePart } from "@/lib/name";

const PUBLIC_PATHS = ["/login", "/takanon"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function NameGate({ children }: { children: React.ReactNode }) {
  const { user, member, configured, getIdToken, refreshMember } = useAuth();
  const pathname = usePathname();
  const [firstName, setFirstName] = useState(member?.firstName ?? "");
  const [familyName, setFamilyName] = useState(member?.familyName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Seed inputs from whatever Google supplied, without clobbering typing.
  useEffect(() => {
    if (member?.firstName) setFirstName((v) => v || member.firstName!);
    if (member?.familyName) setFamilyName((v) => v || member.familyName!);
  }, [member?.firstName, member?.familyName]);

  const needsName =
    configured &&
    !!user &&
    !!member &&
    !member.nameCompleted &&
    !isPublicPath(pathname);

  if (!needsName) return <>{children}</>;

  async function save() {
    if (!isValidNamePart(firstName) || !isValidNamePart(familyName)) {
      setError("יש להזין שם פרטי ושם משפחה");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/account/name", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, familyName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירת השם נכשלה");
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
        <h2 className="text-lg font-bold text-stone-900">הוספת שם</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          כדי להשלים את ההרשמה, יש להזין את השם הפרטי ושם המשפחה שלך.
        </p>

        <input
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) save();
          }}
          placeholder="שם פרטי"
          className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-lg"
        />

        <input
          type="text"
          autoComplete="family-name"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !saving) save();
          }}
          placeholder="שם משפחה"
          className="mt-3 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-lg"
        />

        {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}

        <button
          type="button"
          disabled={saving || !firstName || !familyName}
          onClick={save}
          className="mt-4 w-full rounded-xl bg-kerem-700 px-4 py-3 text-sm font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
        >
          {saving ? "שומר…" : "שמירה והמשך"}
        </button>
      </div>
    </div>
  );
}
