"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Gemach, ToolKindWithAvailability } from "@/lib/types";
import { buildGemachFilterOptions } from "@/lib/gemach";
import { TOOL_CATEGORIES } from "@/lib/tools-admin";
import { ToolCard } from "@/components/tools/ToolCard";
import { ToolMark } from "@/components/brand/Marks";

interface ToolsCatalogProps {
  kinds: ToolKindWithAvailability[];
  gemachim?: Gemach[];
}

interface CategoryTile {
  name: string;
  kinds: number;
  available: number;
}

function categoryName(kind: ToolKindWithAvailability): string {
  const name = kind.category?.trim();
  return name || "אחר";
}

function matchesQuery(kind: ToolKindWithAvailability, query: string): boolean {
  const haystack = [kind.name, kind.description, kind.category, kind.gemachName, kind.brand, kind.location, kind.purpose]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function ToolsCatalog({ kinds, gemachim = [] }: ToolsCatalogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const [query, setQuery] = useState("");
  const [selectedGemachId, setSelectedGemachId] = useState("");

  const filterOptions = useMemo(
    () => buildGemachFilterOptions(kinds, gemachim.filter((g) => g.active)),
    [kinds, gemachim]
  );

  const scoped = useMemo(
    () => (selectedGemachId === "" ? kinds : kinds.filter((k) => k.gemachId === selectedGemachId)),
    [kinds, selectedGemachId]
  );

  const tiles = useMemo(() => {
    const counts = new Map<string, CategoryTile>();
    for (const kind of scoped) {
      const name = categoryName(kind);
      const row = counts.get(name) ?? { name, kinds: 0, available: 0 };
      row.kinds += 1;
      row.available += kind.availableUnits;
      counts.set(name, row);
    }
    const known = TOOL_CATEGORIES.filter((name) => counts.has(name));
    const extra = [...counts.keys()]
      .filter((name) => !known.includes(name as (typeof TOOL_CATEGORIES)[number]))
      .sort((a, b) => a.localeCompare(b, "he"));
    return [...known, ...extra].map((name) => counts.get(name)!);
  }, [scoped]);

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  const visibleKinds = useMemo(() => {
    let rows = scoped;
    if (category) rows = rows.filter((kind) => categoryName(kind) === category);
    if (searching) rows = rows.filter((kind) => matchesQuery(kind, normalizedQuery));
    return rows;
  }, [scoped, category, searching, normalizedQuery]);

  const availableUnits = visibleKinds.reduce((sum, kind) => sum + kind.availableUnits, 0);
  const selectedHasNoTools =
    selectedGemachId !== "" &&
    scoped.length === 0 &&
    filterOptions.some((option) => option.gemachId === selectedGemachId);

  function openCategory(name: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", name);
    router.push(`${pathname}?${params.toString()}`);
    setQuery("");
  }

  function closeCategory() {
    router.push(pathname);
    setQuery("");
  }

  const showTiles = !category && !searching;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="tool-search" className="mb-1.5 block text-sm font-bold text-stone-900">
            חיפוש כלי
          </label>
          <input
            id="tool-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={category ? `חיפוש ב${category}` : "שם כלי, מותג או מיקום"}
            autoComplete="off"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-stone-800 focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
          />
        </div>
        {filterOptions.length > 1 && (
          <div className="sm:w-56">
            <label htmlFor="gemach-filter" className="mb-1.5 block text-sm font-bold text-stone-900">
              גמ״ח
            </label>
            <select
              id="gemach-filter"
              value={selectedGemachId}
              onChange={(event) => setSelectedGemachId(event.target.value)}
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
        )}
      </div>

      {selectedHasNoTools ? (
        <p className="text-center text-[var(--muted)]">לגמ״ח זה עדיין לא נוספו כלים.</p>
      ) : showTiles ? (
        tiles.length === 0 ? (
          <p className="text-center text-[var(--muted)]">אין כלים להצגה.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tiles.map((tile) => (
              <button
                key={tile.name}
                type="button"
                onClick={() => openCategory(tile.name)}
                className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[#fbf7f0] px-3 py-4 text-center transition hover:border-kerem-300 active:bg-warm-100"
              >
                <ToolMark category={tile.name} className="h-16 w-28" />
                <span className="mt-2 text-sm font-bold text-stone-900">{tile.name}</span>
                <span className="mt-1 text-xs text-[var(--muted)]">
                  {tile.kinds === 1 ? "כלי אחד" : `${tile.kinds} כלים`}
                  {" · "}
                  {tile.available === 0
                    ? "אין פנויות"
                    : tile.available === 1
                      ? "יחידה פנויה"
                      : `${tile.available} פנויות`}
                </span>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              {category ? (
                <button
                  type="button"
                  onClick={closeCategory}
                  className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-kerem-700 hover:text-kerem-800"
                >
                  <span aria-hidden="true">→</span>
                  כל הקטגוריות
                </button>
              ) : (
                <p className="mb-1 text-sm text-[var(--muted)]">תוצאות מכל הקטגוריות</p>
              )}
              <h2 className="text-xl font-bold text-stone-900">
                {category || "תוצאות חיפוש"}
              </h2>
            </div>
            <p className="text-sm text-[var(--muted)]">
              {visibleKinds.length === 1 ? "כלי אחד" : `${visibleKinds.length} כלים`}
              {" · "}
              {availableUnits === 1 ? "יחידה פנויה" : `${availableUnits} יחידות פנויות`}
            </p>
          </div>

          {visibleKinds.length === 0 ? (
            <p className="text-center text-[var(--muted)]">
              {searching ? `אין כלים שתואמים ל״${query.trim()}״.` : "אין כלים בקטגוריה הזו."}
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleKinds.map((kind) => (
                <ToolCard key={`${kind.gemachId}:${kind.kindId}`} kind={kind} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
