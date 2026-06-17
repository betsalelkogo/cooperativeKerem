"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { loanStatusLabels } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import type { Loan, Tool } from "@/lib/types";

interface LoanWithTool {
  loan: Loan;
  tool: Tool | null;
}

export default function MyLoansPage() {
  const { getIdToken, user } = useAuth();
  const [items, setItems] = useState<LoanWithTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch("/api/loans", { token });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "שגיאה בטעינה");
        }
        setItems(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, getIdToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="ההשאלות שלי" description="עקבו אחר ההשאלות הפעילות והקודמות." />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardBody className="py-16 text-center">
            <span className="mb-4 inline-block text-5xl">📋</span>
            <p className="text-lg font-semibold text-stone-800">אין השאלות עדיין</p>
            <p className="mt-1 text-sm text-[var(--muted)]">שריינו כלי מהקטלוג ותתחילו!</p>
            <Link
              href="/tools"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-kerem-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-kerem-800"
            >
              ← לכלים הזמינים
            </Link>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-4">
          {items.map(({ loan, tool }) => (
            <li key={loan.id}>
              <Card className="transition hover:shadow-md">
                <CardBody className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-warm-100 text-2xl">
                      🔧
                    </span>
                    <div>
                      <p className="font-bold text-stone-900">{tool?.name ?? loan.toolId}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {loanStatusLabels[loan.status]}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {tool && <StatusBadge status={tool.status} />}
                    {loan.status === "active" && (
                      <Link
                        href={`/return/${loan.id}`}
                        className="rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-kerem-800"
                      >
                        החזרה
                      </Link>
                    )}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
