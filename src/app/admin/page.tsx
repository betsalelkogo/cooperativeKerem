"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { loanStatusLabels, reservationStatusLabels } from "@/lib/labels";
import { formatDateHe } from "@/lib/dates";
import type { AdminDashboardData } from "@/lib/types";

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardBody className="py-4 text-center">
        <p className={`text-3xl font-bold ${accent ?? "text-kerem-800"}`}>{value}</p>
        <p className="mt-1 text-xs font-medium text-[var(--muted)]">{label}</p>
      </CardBody>
    </Card>
  );
}

function formatDateTime(iso?: string) {
  return formatDateHe(iso, true);
}

function formatDay(date?: string) {
  return formatDateHe(date, false);
}

export default function AdminDashboardPage() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch("/api/admin/dashboard", { token });
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "טעינה נכשלה");
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [getIdToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert variant="error">{error || "לא ניתן לטעון נתונים"}</Alert>;
  }

  return (
    <div>
      <PageHeader
        title="לוח בקרה — מנהל"
        description="סקירה של כל הכלים, השאלות פעילות והמשתמשים."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="סה״כ כלים" value={data.stats.totalTools} />
        <StatCard label="זמינים" value={data.stats.available} accent="text-emerald-700" />
        <StatCard label="מושאלים" value={data.stats.onLoan} accent="text-amber-700" />
        <StatCard label="שמירות פעילות" value={data.stats.activeReservations} accent="text-sky-700" />
        <StatCard label="בתחזוקה" value={data.stats.maintenance} accent="text-orange-700" />
        <StatCard label="השאלות פעילות" value={data.stats.activeLoans} accent="text-violet-700" />
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-stone-900">כלים — מצב נוכחי</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-warm-50 text-right">
                <th className="px-4 py-3 font-semibold text-stone-700">כלי</th>
                <th className="px-4 py-3 font-semibold text-stone-700">קטגוריה</th>
                <th className="px-4 py-3 font-semibold text-stone-700">סטטוס</th>
                <th className="px-4 py-3 font-semibold text-stone-700">סוג</th>
                <th className="px-4 py-3 font-semibold text-stone-700">משתמש</th>
                <th className="px-4 py-3 font-semibold text-stone-700">איסוף מתוכנן</th>
                <th className="px-4 py-3 font-semibold text-stone-700">לקיחה בפועל</th>
                <th className="px-4 py-3 font-semibold text-stone-700">החזרה מתוכננת</th>
              </tr>
            </thead>
            <tbody>
              {data.tools.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                    אין כלים במערכת
                  </td>
                </tr>
              ) : (
                data.tools.map((tool) => (
                  <tr key={tool.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium text-stone-900">{tool.name}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{tool.category}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tool.status} />
                    </td>
                    <td className="px-4 py-3">
                      {tool.holderKind === "reservation" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                          שמירה
                        </span>
                      ) : tool.holderKind === "loan" ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800 ring-1 ring-inset ring-sky-200">
                          השאלה
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {tool.borrowerName ? (
                        <div>
                          <p className="font-medium text-stone-800">{tool.borrowerName}</p>
                          {tool.borrowerEmail && (
                            <p className="text-xs text-[var(--muted)]">{tool.borrowerEmail}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatDay(tool.pickupDate)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatDateTime(tool.checkedOutAt)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatDay(tool.returnDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-stone-900">שמירות פעילות</h2>
        {data.activeReservations.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center text-[var(--muted)]">
              אין שמירות פעילות כרגע
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.activeReservations.map((reservation) => (
              <Card key={reservation.id}>
                <CardBody className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-stone-900">{reservation.toolName}</p>
                      <p className="mt-1 text-sm text-stone-700">{reservation.memberName}</p>
                      <p className="text-xs text-[var(--muted)]">{reservation.memberEmail}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                      {reservationStatusLabels[reservation.status]}
                    </span>
                  </div>
                  <p className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                    <span className="block">נשמר: {formatDateTime(reservation.createdAt)}</span>
                    <span className="block">איסוף מתוכנן: {formatDay(reservation.pickupDate)}</span>
                    <span className="block">החזרה מתוכננת: {formatDay(reservation.returnDate)}</span>
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-stone-900">השאלות פעילות</h2>
        {data.activeLoans.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center text-[var(--muted)]">
              אין השאלות פעילות כרגע
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.activeLoans.map((loan) => (
              <Card key={loan.id}>
                <CardBody className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-stone-900">{loan.toolName}</p>
                      <p className="mt-1 text-sm text-stone-700">{loan.memberName}</p>
                      <p className="text-xs text-[var(--muted)]">{loan.memberEmail}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800 ring-1 ring-inset ring-violet-200">
                      {loanStatusLabels[loan.status]}
                    </span>
                  </div>
                  <p className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                    <span className="block">לקיחה בפועל: {formatDateTime(loan.checkedOutAt)}</span>
                    <span className="block">החזרה מתוכננת: {formatDay(loan.dueReturnDate)}</span>
                  </p>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
