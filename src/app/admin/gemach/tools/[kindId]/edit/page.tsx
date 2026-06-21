"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { ToolKindEditForm } from "@/components/admin/ToolKindEditForm";
import { useAdminGemachId } from "@/hooks/useAdminGemachId";
import type { AdminToolKindEdit } from "@/lib/types";

export default function EditGemachToolPage() {
  const router = useRouter();
  const params = useParams();
  const kindId = params.kindId as string;
  const { getIdToken } = useAuth();
  const { gemachId, isPlatformCoopEdit, hrefWithGemachId } = useAdminGemachId();

  const [kind, setKind] = useState<AdminToolKindEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gemachId || !kindId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch(
          `/api/admin/gemach/tools/${encodeURIComponent(kindId)}?gemachId=${encodeURIComponent(gemachId!)}`,
          { token }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "טעינה נכשלה");
        }
        setKind((await res.json()) as AdminToolKindEdit);
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gemachId, kindId, getIdToken]);

  if (!gemachId) {
    return (
      <div className="mx-auto max-w-md py-12">
        <Alert variant="warning">לא נמצא גמ״ח לעריכה — חזרו ללוח הבקרה.</Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (error && !kind) return <Alert variant="error">{error}</Alert>;
  if (!kind) return <Alert variant="error">הכלי לא נמצא</Alert>;

  const backHref = isPlatformCoopEdit ? "/admin" : hrefWithGemachId("/admin/gemach");

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href={backHref}>
        {isPlatformCoopEdit ? "חזרה ללוח פלטפורמה" : "חזרה ללוח הבקרה"}
      </BackLink>

      <PageHeader
        title="עריכת כלי"
        description={
          kind.totalUnits > 1
            ? `${kind.totalUnits} יחידות · תמונה, הערות, משך השאלה`
            : "תמונה, הערות, משך השאלה ופרטים נוספים"
        }
      />

      <ToolKindEditForm
        kind={kind}
        gemachId={gemachId}
        gemachDefaultLocation={kind.gemachLocation}
        getToken={getIdToken}
        onSaved={() => router.push(backHref)}
      />
    </div>
  );
}
