"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { resolveSelectedGemachId, withGemachIdQuery } from "@/lib/gemach-selection";

export function useSelectedGemachId() {
  const { member } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const ownedIds = useMemo(() => member?.gemachAdminIds ?? [], [member?.gemachAdminIds]);
  const urlGemachId = searchParams.get("gemachId");
  const gemachId = resolveSelectedGemachId(ownedIds, urlGemachId);

  const setGemachId = useCallback(
    (id: string) => {
      if (!ownedIds.includes(id)) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("gemachId", id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [ownedIds, pathname, router, searchParams]
  );

  const hrefWithGemachId = useCallback(
    (path: string) => withGemachIdQuery(path, gemachId),
    [gemachId]
  );

  return useMemo(
    () => ({
      gemachId,
      ownedIds,
      hasMultiple: ownedIds.length > 1,
      setGemachId,
      hrefWithGemachId,
    }),
    [gemachId, ownedIds, setGemachId, hrefWithGemachId]
  );
}
