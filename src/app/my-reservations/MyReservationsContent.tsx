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
  ReservationCard,
  type ReservationWithTool,
} from "@/components/my-activity/ActivityCards";
import { formatCredits } from "@/lib/pots";

export default function MyReservationsContent() {
  const { getIdToken, user } = useAuth();
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("created") === "1";

  const [reservations, setReservations] = useState<ReservationWithTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;

    const res = await authFetch("/api/reservations", { token });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error ?? "שגיאה בטעינת שריונים");
    }
    setReservations(await res.json());
  }, [getIdToken]);

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
  }, [user, loadData]);

  async function handleCancelReservation(reservationId: string) {
    const confirmed = window.confirm(
      "לבטל את השריון? הכלי יחזור להיות זמין.\n\nאם כבר שילמתם וביטול הוא לפני מועד תחילת ההשאלה — הסכום יוחזר אוטומטית ליתרה שלכם. אחרי מועד ההתחלה, או בביטול אוטומטי שלא הגעתם, אין החזר אוטומטי."
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
        throw new Error(data.error ?? "ביטול השריון נכשל");
      }
      if (typeof data.refundedAmount === "number" && data.refundedAmount > 0) {
        window.alert(
          `השריון בוטל. זוכו ${formatCredits(data.refundedAmount)} ליתרה שלכם.`
        );
      } else if (data.hadPaidPayment) {
        window.alert(
          "השריון בוטל. הביטול היה אחרי מועד תחילת ההשאלה — אין החזר אוטומטי. אפשר לפנות למנהל."
        );
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ביטול השריון נכשל");
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) return <ActivityLoading />;

  return (
    <div>
      <PageHeader
        title="השריונים שלי"
        description="שלב 1 — שמרתם כלי. כשמגיעים לאסוף, המשיכו ללקיחה והפעלת ההשאלה."
      />

      {justCreated && (
        <Alert variant="success" className="mb-4">
          <p className="font-semibold">השריון נוצר בהצלחה!</p>
          <p className="mt-1 text-sm">
            הכלי שמור עבורכם. ביום האיסוף לחצו «המשך ללקיחה» לתשלום (אם נדרש) והפעלת ההשאלה.
          </p>
        </Alert>
      )}

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {reservations.length === 0 ? (
        <Card className="border-dashed">
          <CardBody className="py-16 text-center">
            <span className="mb-4 inline-block text-5xl">📅</span>
            <p className="text-lg font-semibold text-stone-800">אין שריונים פעילות</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              שריינו כלי מהקטלוג — השריון יופיע כאן עד הלקיחה.
            </p>
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
          {reservations.map(({ reservation, tool }) => (
            <li key={reservation.id}>
              <ReservationCard
                reservation={reservation}
                tool={tool}
                cancelling={cancellingId === reservation.id}
                onCancel={handleCancelReservation}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        כבר לקחתם כלי?{" "}
        <Link href="/my-loans" className="font-semibold text-kerem-700 underline">
          עברו להשאלות שלי
        </Link>
      </p>
    </div>
  );
}
