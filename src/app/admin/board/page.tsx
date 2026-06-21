"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import type { BoardDashboardData } from "@/lib/types";

export default function BoardLogisticsPage() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<BoardDashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch("/api/admin/board", { token });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "שגיאה בטעינה");
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      }
    }
    load();
  }, [getIdToken]);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const { logistics, recentDisputes } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-900">לוח לוגיסטיקה — דירקטוריון</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "סה״כ יחידות", value: logistics.totalUnits },
          { label: "זמינות", value: logistics.availableUnits },
          { label: "בהשאלה", value: logistics.onLoanUnits },
          { label: "בשריון", value: logistics.reservedUnits },
          { label: "תחזוקה", value: logistics.maintenanceUnits },
          { label: "מושבתות", value: logistics.disabledUnits },
          { label: "מחלוקות פתוחות", value: logistics.activeDisputes },
          { label: "דיווחי תקלה", value: logistics.openProblemReports },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardBody className="py-4">
              <p className="text-xs font-semibold text-[var(--muted)]">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold text-stone-900">{stat.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <h2 className="mb-4 text-lg font-bold">מחלוקות אחרונות</h2>
          {recentDisputes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">אין מחלוקות</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recentDisputes.map((d) => (
                <li key={d.id} className="py-3 text-sm">
                  <Link
                    href={`/admin/disputes?id=${encodeURIComponent(d.id)}`}
                    className="flex justify-between gap-4 transition hover:text-kerem-800"
                  >
                    <span>
                      {d.toolName} · {d.memberName}
                    </span>
                    <span className="text-[var(--muted)]">
                      {DISPUTE_STATUS_LABELS[d.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
