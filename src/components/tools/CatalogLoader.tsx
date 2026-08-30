"use client";

import { useEffect, useState } from "react";
import type { ToolKindWithAvailability } from "@/lib/types";
import { readCachedCatalog, writeCachedCatalog } from "@/lib/client-catalog";
import { ToolsCatalog } from "@/components/tools/ToolsCatalog";

export function CatalogLoader() {
  const [kinds, setKinds] = useState<ToolKindWithAvailability[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const cached = readCachedCatalog();
    if (cached) {
      setKinds(cached);
      return;
    }

    let cancelled = false;
    fetch("/api/tools/catalog")
      .then((res) => {
        if (!res.ok) throw new Error("לא ניתן לטעון את הקטלוג");
        return res.json() as Promise<ToolKindWithAvailability[]>;
      })
      .then((data) => {
        if (cancelled) return;
        writeCachedCatalog(data);
        setKinds(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-center text-[var(--muted)]">{error}</p>;
  }

  if (!kinds) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (kinds.length === 0) {
    return (
      <p className="text-center text-[var(--muted)]">
        אין כלים במערכת. הריצו <code className="rounded bg-warm-100 px-1">npm run seed</code>.
      </p>
    );
  }

  return <ToolsCatalog kinds={kinds} />;
}
