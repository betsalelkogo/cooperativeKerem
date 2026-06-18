"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { isPlatformAdmin } from "@/lib/admin";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";

/** Gemach scope for admin tool pages — URL param for platform admin, owned gemach otherwise. */
export function useAdminGemachId() {
  const { member } = useAuth();
  const searchParams = useSearchParams();
  const { gemachId: ownedGemachId, hrefWithGemachId } = useSelectedGemachId();
  const urlGemachId = searchParams.get("gemachId");

  const gemachId =
    member && isPlatformAdmin(member) && urlGemachId
      ? urlGemachId
      : ownedGemachId;

  const isPlatformCoopEdit =
    !!member &&
    isPlatformAdmin(member) &&
    !!urlGemachId &&
    !ownedGemachId?.includes(urlGemachId);

  return { gemachId, isPlatformCoopEdit, hrefWithGemachId };
}
