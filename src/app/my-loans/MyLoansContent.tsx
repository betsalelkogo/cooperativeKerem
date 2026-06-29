"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import {
  ActivityLoading,
  LoanGroupCard,
  type LoanWithTool,
} from "@/components/my-activity/ActivityCards";

/**
 * Group loans by booking. A multi-unit loan is now a single document (carrying
 * `quantity`); legacy data stored one doc per unit linked by `groupId`.
 */
function groupLoans(items: LoanWithTool[]): LoanWithTool[][] {
  const groups = new Map<string, LoanWithTool[]>();
  for (const item of items) {
    const key = item.loan.groupId ?? item.loan.id;
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

export default function MyLoansContent() {
  const { getIdToken, user } = useAuth();
  const searchParams = useSearchParams();
  const justPickedUp = searchParams.get("pickedUp") === "1";
  const justReturned = searchParams.get("returned") === "1";

  const [loans, setLoans] = useState<LoanWithTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLoans = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;

    const res = await authFetch("/api/loans", { token });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "שגיאה בטעינת השאלות");
    }
    setLoans(await res.json());
  }, [getIdToken]);

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
  }, [user, loadLoans]);

  if (loading) return <ActivityLoading />;

  const activeLoans = loans.filter(({ loan }) => loan.status === "active");
  const pastLoans = loans.filter(({ loan }) => loan.status !== "active");
  const activeGroups = groupLoans(activeLoans);
  const pastGroups = groupLoans(pastLoans);

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
              השאלה מתחילה אחרי שריון ולקיחה מהשריונים שלי.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/my-reservations"
                className="inline-flex items-center gap-2 rounded-xl border border-kerem-200 bg-kerem-50 px-5 py-2.5 text-sm font-semibold text-kerem-800 transition hover:bg-kerem-100"
              >
                לשריונים שלי
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
          {activeGroups.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-base font-bold text-stone-900">השאלות פעילות</h2>
              <ul className="space-y-4">
                {activeGroups.map((group) => (
                  <li key={group[0].loan.id}>
                    <LoanGroupCard
                      items={group}
                      getToken={getIdToken}
                      onPhotoAdded={loadLoans}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pastGroups.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-bold text-stone-900">היסטוריה</h2>
              <ul className="space-y-4">
                {pastGroups.map((group) => (
                  <li key={group[0].loan.id}>
                    <LoanGroupCard items={group} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        יש שריון שטרם לקחתם?{" "}
        <Link href="/my-reservations" className="font-semibold text-kerem-700 underline">
          עברו לשריונים שלי
        </Link>
      </p>
    </div>
  );
}
