"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";
import type { Gemach } from "@/lib/types";

export function GemachSelector() {
  const { getIdToken } = useAuth();
  const { gemachId, hasMultiple, setGemachId } = useSelectedGemachId();
  const [gemachim, setGemachim] = useState<Gemach[]>([]);

  useEffect(() => {
    if (!hasMultiple) return;

    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch("/api/admin/gemach/owned", { token });
        if (!res.ok) return;
        const data = await res.json();
        setGemachim(data.gemachim ?? []);
      } catch {
        // ignore — selector falls back to ids
      }
    }
    load();
  }, [hasMultiple, getIdToken]);

  if (!hasMultiple || !gemachId) return null;

  return (
    <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="admin-gemach-select" className="text-sm font-bold text-stone-900">
        הגמ״ח שלי
      </label>
      <select
        id="admin-gemach-select"
        value={gemachId}
        onChange={(e) => setGemachId(e.target.value)}
        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-stone-800 focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200 sm:max-w-xs"
      >
        {(gemachim.length > 0
          ? gemachim
          : [{ id: gemachId, name: gemachId } as Gemach]
        ).map((gemach) => (
          <option key={gemach.id} value={gemach.id}>
            {gemach.name}
          </option>
        ))}
      </select>
    </div>
  );
}
