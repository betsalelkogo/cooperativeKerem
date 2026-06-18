"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import {
  ActivityLoading,
  LoanCard,
  type LoanWithTool,
} from "@/components/my-activity/ActivityCards";

export default function MyLoansContent() {
  const { getIdToken, user } = useAuth();
  const searchParams = useSearchParams();
  const justPickedUp = searchParams.get("pickedUp") === "1";
  const justReturned = searchParams.get("returned") === "1";

  const [loans, setLoans] = useState<LoanWithTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLoans() {
    const token = await getIdToken();
    if (!token) return;

    const res = await authFetch("/api/loans", { token });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "שגיאה בטעינת השאלות");
    }
    setLoans(await res.json());
  }

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        await loadLoans();
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, getIdToken]);

  if (loading) return <ActivityLoading />;

  const activeLoans = loans.filter(({ loan }) => loan.status === "active");
  const pastLoans = loans.filter(({ loan }) => loan.status !== "active");

  return (
    <div>
      <PageHeader
        title="ההשאלות שלי"
        description="שלב 2 — כלים שכבר לקחתם, החזרה והיסטוריה."
      />

      {justPickedUp && (
        <Alert variant="success" className="mb-4">
          <p className="font-semibold">ההשאלה הופעלה!</p>
          <p className="mt-1 text-sm">הכלי אצלכם. אל תשכחו להחזיר ולסגור בטופס ההחזרה.</p>
        </Alert>
      )}

      {justReturned && (
        <Alert variant="success" className="mb-4">
          <p className="font-semibold">ההשאלה נסגרה בהצלחה!</p>
          <p className="mt-1 text-sm">תודה שהחזרתם את הכלי.</p>
        </Alert>
      )}

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loans.length === 0 ? (
        <Card className="border-dashed">
          <CardBody className="py-16 text-center">
            <span className="mb-4 inline-block text-5xl">🔧</span>
            <p className="text-lg font-semibold text-stone-800">אין השאלות עדיין</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              השאלה מתחילה אחרי שמירה ולקיחה מהשמירות שלי.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/my-reservations"
                className="inline-flex items-center gap-2 rounded-xl border border-kerem-200 bg-kerem-50 px-5 py-2.5 text-sm font-semibold text-kerem-800 transition hover:bg-kerem-100"
              >
                לשמירות שלי
              </Link>
              <Link
                href="/tools"
                className="inline-flex items-center gap-2 rounded-xl bg-kerem-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-kerem-800"
              >
                ← לכלים הזמינים
              </Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {activeLoans.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-base font-bold text-stone-900">השאלות פעילות</h2>
              <ul className="space-y-4">
                {activeLoans.map(({ loan, tool }) => (
                  <li key={loan.id}>
                    <LoanCard
                      loan={loan}
                      tool={tool}
                      getToken={getIdToken}
                      onPhotoAdded={loadLoans}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pastLoans.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-bold text-stone-900">היסטוריה</h2>
              <ul className="space-y-4">
                {pastLoans.map(({ loan, tool }) => (
                  <li key={loan.id}>
                    <LoanCard loan={loan} tool={tool} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        יש שמירה שטרם לקחתם?{" "}
        <Link href="/my-reservations" className="font-semibold text-kerem-700 underline">
          עברו לשמירות שלי
        </Link>
      </p>
    </div>
  );
}
