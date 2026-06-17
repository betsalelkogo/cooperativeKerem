"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatNIS } from "@/lib/pots";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import type { MemberPayment } from "@/lib/types";

interface PayboxPaymentStepProps {
  reservationId: string;
  amount: number;
  toolName: string;
  onPaid: () => void;
}

const RETURN_KEY = (id: string) => `kerem-paybox-return-${id}`;

export function PayboxPaymentStep({
  reservationId,
  amount,
  toolName,
  onPaid,
}: PayboxPaymentStepProps) {
  const { user, member, getIdToken } = useAuth();
  const [payment, setPayment] = useState<MemberPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [openedPaybox, setOpenedPaybox] = useState(false);
  const [returnedToSite, setReturnedToSite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const checkoutUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/checkout/${reservationId}`
      : `/checkout/${reservationId}`;

  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const restorePayment = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await authFetch(
        `/api/payments/paybox?reservationId=${reservationId}`,
        { token }
      );
      if (!res.ok) return;

      const data = await res.json();
      if (data.paid) {
        onPaidRef.current();
        return;
      }
      if (data.payment) {
        setPayment(data.payment);
        if (sessionStorage.getItem(RETURN_KEY(reservationId))) {
          setOpenedPaybox(true);
        }
      }
    } catch {
      /* ignore restore errors */
    } finally {
      setLoading(false);
    }
  }, [reservationId, getIdToken]);

  useEffect(() => {
    restorePayment();
  }, [restorePayment]);

  useEffect(() => {
    if (!openedPaybox) return;

    function onVisible() {
      if (document.visibilityState === "visible") {
        setReturnedToSite(true);
      }
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [openedPaybox]);

  async function createPayment() {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/payments/paybox", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          action: "create",
          fullName: member?.name ?? user?.displayName ?? "חבר כרם",
          phone: user?.phoneNumber ?? "0500000000",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "יצירת תשלום נכשלה");
      }

      setPayment(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  function openPaybox() {
    const payUrl = payment?.growPaymentUrl ?? payment?.payboxGroupUrl;
    if (!payUrl) return;

    sessionStorage.setItem(RETURN_KEY(reservationId), checkoutUrl);
    setOpenedPaybox(true);
    setReturnedToSite(false);

    const opened = window.open(payUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = payUrl;
    }
  }

  async function copyReturnLink() {
    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("לא הצלחנו להעתיק — שמרו את הכתובת ידנית");
    }
  }

  async function confirmPayment() {
    if (!payment) return;
    setConfirming(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/payments/paybox", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          paymentId: payment.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "אישור תשלום נכשל");
      }

      sessionStorage.removeItem(RETURN_KEY(reservationId));
      onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setConfirming(false);
    }
  }

  if (loading && !payment) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-kerem-200 shadow-md">
        <CardBody className="space-y-5 py-6">
          <div className="text-center">
            <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-kerem-100 text-2xl">
              💳
            </span>
            <h2 className="text-xl font-bold text-stone-900">תשלום דמי השאלה</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {toolName} · {formatNIS(amount)} · קבוצת «קאופורטיב טסט»
            </p>
          </div>

          {!payment ? (
            <Button
              type="button"
              onClick={createPayment}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? "מכין תשלום…" : "המשך לתשלום ב-PayBox"}
            </Button>
          ) : (
            <div className="space-y-4">
              <ol className="space-y-2 rounded-xl bg-warm-50 p-4 text-sm leading-relaxed text-stone-700 ring-1 ring-[var(--border)]">
                <li>
                  <span className="font-bold text-kerem-800">1.</span> לחצו «פתיחת PayBox»
                  ושלמו {formatNIS(amount)} בקבוצה
                </li>
                <li>
                  <span className="font-bold text-kerem-800">2.</span> חזרו לדפדפן — כרטיסייה
                  זו נשארת פתוחה
                </li>
                <li>
                  <span className="font-bold text-kerem-800">3.</span> לחצו «שילמתי — המשך
                  ללקיחה»
                </li>
              </ol>

              <Button
                type="button"
                onClick={openPaybox}
                className="w-full bg-[#5C4DFF] hover:bg-[#4a3de6]"
                size="lg"
              >
                פתיחת PayBox לתשלום {formatNIS(amount)}
              </Button>

              {openedPaybox && (
                <Alert variant="info">
                  PayBox נפתח. לאחר התשלום, חזרו לכרטיסייה הזו בדפדפן (או באפליקציית כרם
                  אם הוספתם למסך הבית).
                </Alert>
              )}

              {returnedToSite && (
                <Alert variant="success">ברוכים השבים! אשרו שהתשלום בוצע ולחצו המשך.</Alert>
              )}

              <Button
                type="button"
                onClick={confirmPayment}
                disabled={confirming}
                className={cn(
                  "w-full",
                  returnedToSite && "ring-2 ring-kerem-400 ring-offset-2"
                )}
                size="lg"
              >
                {confirming ? "מאשר…" : "שילמתי — המשך ללקיחה"}
              </Button>
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}
        </CardBody>
      </Card>

      {payment && (
        <Card className="border-dashed border-[var(--border)]">
          <CardBody className="space-y-3 py-4">
            <p className="text-sm font-semibold text-stone-800">איבדתם את הדף?</p>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              שמרו קישור זה לפני התשלום — הוא מחזיר אתכם ישירות לכאן:
            </p>
            <code className="block break-all rounded-lg bg-warm-100 px-3 py-2 text-xs text-stone-700">
              {checkoutUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={copyReturnLink}>
                {copied ? "הועתק ✓" : "העתקת קישור חזרה"}
              </Button>
              <a
                href={checkoutUrl}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-stone-700 active:bg-warm-50"
              >
                חזרה לדף התשלום
              </a>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
