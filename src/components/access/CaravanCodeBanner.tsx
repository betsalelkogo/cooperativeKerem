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

  return (
    <div className="mb-6 rounded-2xl border border-kerem-200 bg-kerem-50/70 px-4 py-3">
      <p className="text-xs font-bold text-kerem-800">קוד קרוואן</p>
      <p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-kerem-950" dir="ltr">
        {code}
      </p>
      {member && (isPaidMember(member) || isBoardMember(member)) && (
        <Link href="/access" className="mt-2 inline-block text-sm font-semibold text-kerem-800 underline">
          קוד חדר המועדון →
        </Link>
      )}
    </div>
  );
}
