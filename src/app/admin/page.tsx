"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { hasOwnedGemachim } from "@/lib/admin";
import { PLATFORM_GEMACH_ID } from "@/lib/gemach";
import {
  AdminDashboardView,
  AdminDashboardLoading,
  AdminDashboardError,
} from "@/components/admin/AdminDashboardView";
import type { AdminDashboardData } from "@/lib/types";

export default function AdminDashboardPage() {
  const { member, getIdToken } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/dashboard", { token });
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
  }, [getIdToken]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) return <AdminDashboardLoading />;
  if (error || !data) return <AdminDashboardError message={error} />;

  const ownedGemach = member && hasOwnedGemachim(member);

  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        {ownedGemach && (
          <Link
            href="/admin/gemach"
            className="rounded-xl border border-kerem-200 bg-kerem-50 px-4 py-2.5 text-sm font-semibold text-kerem-800 transition hover:bg-kerem-100"
          >
            {"הגמ\u05f4ח שלי"}
          </Link>
        )}
        <Link
          href="/gemach/new"
          className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-700"
        >
          {ownedGemach ? `+ הוסף ${"\u05d2\u05de\u05f4\u05d7"} נוסף` : `+ הוסף ${"\u05d2\u05de\u05f4\u05d7"} שותף`}
        </Link>
      </div>
      <AdminDashboardView
        data={data}
        title="לוח בקרה — מנהל פלטפורמה"
        description={`סקירה של כל הכלים, ה${"\u05d2\u05de\u05f4\u05d7\u05d9\u05dd"}, השאלות פעילות והמשתמשים.`}
        showGemachColumn
        showGemachimList
        editableTools
        cooperativeOnly
        showLateFees
        gemachId={PLATFORM_GEMACH_ID}
        getToken={getIdToken}
        onRefresh={loadDashboard}
      />
    </div>
  );
}
