import type { ToolKindWithAvailability } from "@/lib/types";

const CATALOG_KEY = "kerem.catalog.kinds";

function canUseSession() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function kindMatches(kind: ToolKindWithAvailability, id: string) {
  return (
    kind.catalogId === id ||
    kind.kindId === id ||
    kind.representativeToolId === id
  );
}

export function readCachedCatalog(): ToolKindWithAvailability[] | null {
  if (!canUseSession()) return null;
  try {
    const raw = sessionStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ToolKindWithAvailability[]) : null;
  } catch {
    return null;
  }
}

export function writeCachedCatalog(kinds: ToolKindWithAvailability[]) {
  if (!canUseSession()) return;
  sessionStorage.setItem(CATALOG_KEY, JSON.stringify(kinds));
}

export function findCachedKind(id: string): ToolKindWithAvailability | null {
  const catalog = readCachedCatalog();
  return catalog?.find((kind) => kindMatches(kind, id)) ?? null;
}

export function clearCachedCatalog() {
  if (!canUseSession()) return;
  sessionStorage.removeItem(CATALOG_KEY);
}

export function rememberKind(kind: ToolKindWithAvailability) {
  const catalog = readCachedCatalog() ?? [];
  const next = catalog.some((row) => kindMatches(row, kind.catalogId))
    ? catalog.map((row) => (kindMatches(row, kind.catalogId) ? kind : row))
    : [...catalog, kind];
  writeCachedCatalog(next);
}
