"use client";

import { useMemo, useState } from "react";
import type { Gemach, ToolKindWithAvailability } from "@/lib/types";
import { COOPERATIVE_FILTER_LABEL, gemachFilterLabel } from "@/lib/gemach";
import { ToolCard } from "@/components/tools/ToolCard";

interface GemachFilterOption {
  gemachId: string;
  label: string;
}

function buildFilterOptions(
  kinds: ToolKindWithAvailability[],
  gemachim: Gemach[]
): GemachFilterOption[] {
  const byId = new Map<string, GemachFilterOption>();

  for (const gemach of gemachim) {
    if (!gemach.active) continue;
    byId.set(gemach.id, {
      gemachId: gemach.id,
      label: gemachFilterLabel(gemach),
    });
  }

  for (const kind of kinds) {
    if (byId.has(kind.gemachId)) continue;
    const isPlatform = !kind.isPartnerGemach;
    byId.set(kind.gemachId, {
      gemachId: kind.gemachId,
      label: isPlatform
        ? COOPERATIVE_FILTER_LABEL
        : (kind.gemachName ?? kind.gemachId),
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.label === COOPERATIVE_FILTER_LABEL) return -1;
    if (b.label === COOPERATIVE_FILTER_LABEL) return 1;
    return a.label.localeCompare(b.label, "he");
  });
}

interface ToolsCatalogProps {
  kinds: ToolKindWithAvailability[];
  gemachim?: Gemach[];
}

export function ToolsCatalog({ kinds, gemachim = [] }: ToolsCatalogProps) {
  const filterOptions = useMemo(
    () => buildFilterOptions(kinds, gemachim),
    [kinds, gemachim]
  );
  const [selectedGemachId, setSelectedGemachId] = useState("");

  const filtered =
    selectedGemachId === ""
      ? kinds
      : kinds.filter((k) => k.gemachId === selectedGemachId);

  const availableUnits = filtered.reduce((sum, k) => sum + k.availableUnits, 0);
  const selectedHasNoTools =
    selectedGemachId !== "" &&
    filtered.length === 0 &&
    filterOptions.some((o) => o.gemachId === selectedGemachId);

  return (
    <>
      {filterOptions.length > 1 && (
        <section className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <label
              htmlFor="gemach-filter"
              className="mb-1.5 block text-sm font-bold text-stone-900"
            >
              סינון לפי גמ״ח
            </label>
            <select
              id="gemach-filter"
              value={selectedGemachId}
              onChange={(e) => setSelectedGemachId(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-stone-800 focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
            >
              <option value="">כל הגמ״חים</option>
              {filterOptions.map((option) => (
                <option key={option.gemachId} value={option.gemachId}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <div className="mb-6 flex justify-end">
        <div className="rounded-xl bg-kerem-50 px-4 py-2 text-center ring-1 ring-kerem-200">
          <p className="text-2xl font-bold text-kerem-800">{availableUnits}</p>
          <p className="text-xs font-medium text-kerem-600">יחידות זמינות</p>
        </div>
      </div>

      {selectedHasNoTools ? (
        <p className="text-center text-[var(--muted)]">
          לגמ״ח זה עדיין לא נוספו כלים.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-[var(--muted)]">אין כלים התואמים את הסינון.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((kind) => (
            <ToolCard key={`${kind.gemachId}:${kind.kindId}`} kind={kind} />
          ))}
        </div>
      )}
    </>
  );
}
