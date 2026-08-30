"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ToolKindWithAvailability } from "@/lib/types";
import { findCachedKind, rememberKind } from "@/lib/client-catalog";
import { ToolDetailView } from "@/components/tools/ToolDetailView";

export function ToolDetailLoader() {
  const params = useParams<{ id: string }>();
  const [kind, setKind] = useState<ToolKindWithAvailability | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = params.id;
    if (!id) return;

    const cached = findCachedKind(id);
    if (cached) {
      setKind(cached);
      return;
    }

    let cancelled = false;
    fetch(`/api/tools/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error("הכלי לא נמצא");
        return res.json() as Promise<ToolKindWithAvailability>;
      })
      .then((data) => {
        if (cancelled) return;
        rememberKind(data);
        setKind(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return <p className="py-20 text-center text-[var(--muted)]">{error}</p>;
  }

  if (!kind) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  return <ToolDetailView kind={kind} />;
}
