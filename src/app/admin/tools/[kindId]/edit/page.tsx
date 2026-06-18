"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { PLATFORM_GEMACH_ID } from "@/lib/gemach";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { ToolKindEditForm } from "@/components/admin/ToolKindEditForm";
import type { AdminToolKindEdit } from "@/lib/types";

/** Platform admin — edit cooperative tool only. */
export default function PlatformEditToolPage() {
  const router = useRouter();
  const params = useParams();
  const kindId = params.kindId as string;
  const { getIdToken } = useAuth();
  const gemachId = PLATFORM_GEMACH_ID;

  const [kind, setKind] = useState<AdminToolKindEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch(
          `/api/admin/gemach/tools/${encodeURIComponent(kindId)}?gemachId=${encodeURIComponent(gemachId)}`,
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
    if (kindId) load();
  }, [kindId, getIdToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (error && !kind) return <Alert variant="error">{error}</Alert>;
  if (!kind) return <Alert variant="error">הכלי לא נמצא</Alert>;

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin">חזרה ללוח פלטפורמה</BackLink>

      <PageHeader
        title="עריכת כלי — קואופרטיב"
        description="תמונה, הערות פנימיות, משך השאלה ופרטי הכלי"
      />

      <ToolKindEditForm
        kind={kind}
        gemachId={gemachId}
        getToken={getIdToken}
        onSaved={() => router.push("/admin")}
      />
    </div>
  );
}
