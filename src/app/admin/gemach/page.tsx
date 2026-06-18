"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import {
  AdminDashboardView,
  AdminDashboardLoading,
  AdminDashboardError,
} from "@/components/admin/AdminDashboardView";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { DeleteGemachButton } from "@/components/admin/DeleteGemachButton";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";
import type { AdminDashboardData } from "@/lib/types";

export default function GemachAdminDashboardPage() {
  const [banner, setBanner] = useState<"created" | "toolsAdded" | null>(null);
  const [toolsAddedCount, setToolsAddedCount] = useState(0);
  const { member, getIdToken } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const { gemachId, hrefWithGemachId } = useSelectedGemachId();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("created") === "1") setBanner("created");
    const added = params.get("toolsAdded");
    if (added) {
      setBanner("toolsAdded");
      setToolsAddedCount(Number(added) || 1);
    }
  }, []);

  useEffect(() => {
    if (!gemachId) {
      setLoading(false);
      return;
    }
    loadDashboard();
  }, [gemachId, getIdToken]);

  async function loadDashboard() {
    if (!gemachId) return;
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await authFetch(
        `/api/admin/gemach/dashboard?gemachId=${encodeURIComponent(gemachId)}`,
        { token }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "טעינה נכשלה");
      }
      setData(await res.json());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  if (!gemachId && !loading) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <Alert variant="warning" className="mb-6">
          עדיין אין לכם גמ״ח במערכת.
        </Alert>
        <ButtonLink href="/gemach/new" size="lg">
          הוסיפו את הגמ״ח שלכם
        </ButtonLink>
      </div>
    );
  }

  if (loading) return <AdminDashboardLoading />;
  if (error || !data) return <AdminDashboardError message={error} />;

  return (
    <div>
      {banner === "created" && (
        <Alert variant="success" className="mb-6">
          <p className="font-semibold">הגמ״ח נוצר בהצלחה!</p>
          <p className="mt-1 text-sm">
            השלב הבא:{" "}
            <Link href={hrefWithGemachId("/admin/gemach/tools/new")} className="font-semibold underline">
              הוסיפו את הכלים הראשונים
            </Link>
          </p>
        </Alert>
      )}
      {banner === "toolsAdded" && (
        <Alert variant="success" className="mb-6">
          <p className="font-semibold">
            {toolsAddedCount === 1
              ? "הכלי נוסף לרשימה!"
              : `${toolsAddedCount} יחידות נוספו לרשימה!`}
          </p>
          <p className="mt-1 text-sm">
            הכלים מופיעים עכשיו ב{" "}
            <Link href="/tools" className="font-semibold underline">
              רשימת הכלים
            </Link>{" "}
            עם תג ★.
          </p>
        </Alert>
      )}

      {data.gemach && !data.gemach.active && (
        <Alert variant="warning" className="mb-6">
          הגמ״ח סגור לצמיתות — ניתן לצפות בהיסטוריה בלבד.
        </Alert>
      )}

      {data.gemach?.active !== false && (
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <DeleteGemachButton
          gemachId={gemachId!}
          gemachName={data.gemach?.name ?? ""}
        />
        <Link
          href={hrefWithGemachId("/admin/gemach/tools/new")}
          className="rounded-xl bg-kerem-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-kerem-800"
        >
          + הוסף כלי
        </Link>
      </div>
      )}

      <AdminDashboardView
        data={data}
        title="לוח בקרה — גמ״ח"
        description="סקירה של הכלים, השאלות והשמירות של הגמ״ח שלך."
        editableTools={data.gemach?.active !== false}
        gemachId={gemachId}
        getToken={getIdToken}
        onToolsUpdated={loadDashboard}
        onRefresh={loadDashboard}
      />
    </div>
  );
}
