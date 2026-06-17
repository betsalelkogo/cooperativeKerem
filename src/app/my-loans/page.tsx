"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { loanStatusLabels, reservationStatusLabels } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { formatDateHe } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import type { Loan, Reservation, Tool } from "@/lib/types";

interface LoanWithTool {
  loan: Loan;
  tool: Tool | null;
}

interface ReservationWithTool {
  reservation: Reservation;
  tool: Tool | null;
}

function formatDate(iso?: string) {
  return formatDateHe(iso, Boolean(iso?.includes("T")));
}

export default function MyLoansPage() {
  const { getIdToken, user } = useAuth();
  const [loans, setLoans] = useState<LoanWithTool[]>([]);
  const [reservations, setReservations] = useState<ReservationWithTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function loadData() {
    const token = await getIdToken();
    if (!token) return;

    const [loansRes, reservationsRes] = await Promise.all([
      authFetch("/api/loans", { token }),
      authFetch("/api/reservations", { token }),
    ]);

    if (!loansRes.ok) {
      const data = await loansRes.json();
      throw new Error(data.error ?? "שגיאה בטעינת השאלות");
    }
    if (!reservationsRes.ok) {
      const data = await reservationsRes.json();
      throw new Error(data.error ?? "שגיאה בטעינת שמירות");
    }

    setLoans(await loansRes.json());
    setReservations(await reservationsRes.json());
  }

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, getIdToken]);

  async function handleCancelReservation(reservationId: string) {
    const confirmed = window.confirm(
      "לבטל את השמירה? הכלי יחזור להיות זמין.\n\nאם כבר שילמת דרך PayBox, פנו למנהל לגבי החזר."
    );
    if (!confirmed) return;

    setCancellingId(reservationId);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch(`/api/reservations/${reservationId}`, {
        method: "DELETE",
        token,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "ביטול השמירה נכשל");
      }
      if (data.hadPaidPayment) {
        window.alert("השמירה בוטלה. שילמת דרך PayBox — פנו למנהל לגבי החזר.");
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ביטול השמירה נכשל");
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const isEmpty = loans.length === 0 && reservations.length === 0;

  return (
    <div>
      <PageHeader
        title="ההשאלות שלי"
        description="שמירות פעילות, השאלות בתהליך והיסטוריה."
      />

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {reservations.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-bold text-stone-900">שמירות פעילות</h2>
          <p className="mb-4 text-sm text-[var(--muted)]">
            השלימו תשלום ולקיחה כדי להפוך את השמירה להשאלה.
          </p>
          <ul className="space-y-4">
            {reservations.map(({ reservation, tool }) => (
              <li key={reservation.id}>
                <Card className="border-amber-200 bg-amber-50/40">
                  <CardBody className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                        📅
                      </span>
                      <div>
                        <p className="font-bold text-stone-900">{tool?.name ?? reservation.toolId}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {reservationStatusLabels[reservation.status]}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          נשמר: {formatDate(reservation.createdAt)}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          איסוף מתוכנן: {formatDate(reservation.pickupDate)} · החזרה: {formatDate(reservation.returnDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {tool && <StatusBadge status={tool.status} />}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={cancellingId === reservation.id}
                        onClick={() => handleCancelReservation(reservation.id)}
                      >
                        {cancellingId === reservation.id ? "מבטל..." : "בטל שמירה"}
                      </Button>
                      <Link
                        href={`/checkout/${reservation.id}`}
                        className="rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-kerem-800"
                      >
                        המשך ללקיחה
                      </Link>
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isEmpty ? (
        <Card className="border-dashed">
          <CardBody className="py-16 text-center">
            <span className="mb-4 inline-block text-5xl">📋</span>
            <p className="text-lg font-semibold text-stone-800">אין השאלות או שמירות עדיין</p>
            <p className="mt-1 text-sm text-[var(--muted)]">שריינו כלי מהקטלוג ותתחילו!</p>
            <Link
              href="/tools"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-kerem-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-kerem-800"
            >
              ← לכלים הזמינים
            </Link>
          </CardBody>
        </Card>
      ) : loans.length > 0 ? (
        <section>
          <h2 className="mb-3 text-base font-bold text-stone-900">השאלות</h2>
          <ul className="space-y-4">
            {loans.map(({ loan, tool }) => (
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
                        {loan.checkedOutAt && (
                          <p className="text-xs text-[var(--muted)]">
                            נלקח: {formatDate(loan.checkedOutAt)}
                          </p>
                        )}
                        {loan.dueReturnDate && (
                          <p className="text-xs text-[var(--muted)]">
                            החזרה מתוכננת: {formatDate(loan.dueReturnDate)}
                          </p>
                        )}
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
        </section>
      ) : null}
    </div>
  );
}
