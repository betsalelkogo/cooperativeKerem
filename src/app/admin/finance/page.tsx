"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { formatNIS } from "@/lib/pots";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import type { BoardDashboardData } from "@/lib/types";

export default function BoardFinancePage() {
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

  const { finance } = data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-stone-900">לוח כספים — דירקטוריון</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "יתרת תפעול", value: formatNIS(finance.operationsBalance) },
          { label: "יתרת קופות כלים", value: formatNIS(finance.deviceBalanceTotal) },
          { label: "סה״כ הכנסות", value: formatNIS(finance.totalIncome) },
          { label: "סה״כ הוצאות", value: formatNIS(finance.totalExpenses) },
          { label: "קנסות איחור שלא שולמו", value: formatNIS(finance.unpaidLateFees) },
          { label: "תשלומים ממתינים", value: formatNIS(finance.pendingPayouts) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardBody className="py-4">
              <p className="text-xs font-semibold text-[var(--muted)]">{stat.label}</p>
              <p className="mt-1 text-xl font-bold text-stone-900">{stat.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
