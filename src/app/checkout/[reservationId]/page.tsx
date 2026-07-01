"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { SafetyChecklist } from "@/components/loan/SafetyChecklist";
import { ItemChecklist, ConditionNotes } from "@/components/loan/ItemChecklist";
import { PhotoCapture } from "@/components/loan/PhotoCapture";
import { PayboxPaymentStep } from "@/components/payment/PayboxPaymentStep";
import { QrScanner } from "@/components/loan/QrScanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepProgress } from "@/components/ui/StepProgress";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { compressImageFile } from "@/lib/compress-image";
import { canStartCheckout } from "@/lib/reservation-checkout";
import { REQUIRE_QR_SCAN } from "@/lib/features";
import { PLATFORM_GEMACH_ID } from "@/lib/gemach";
import type { Reservation, Tool } from "@/lib/types";

type Step = "payment" | "qr" | "items" | "safety" | "condition" | "photo" | "done";

function stepAfterPayment(hasItems: boolean, hasSafety: boolean): Step {
  if (REQUIRE_QR_SCAN) return "qr";
  if (hasItems) return "items";
  return hasSafety ? "safety" : "condition";
}

function stepAfterQr(hasItems: boolean, hasSafety: boolean): Step {
  if (hasItems) return "items";
  return hasSafety ? "safety" : "condition";
}

export default function CheckoutPage() {
  const params = useParams<{ reservationId: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("payment");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [conditionNotes, setConditionNotes] = useState("");
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const includedItems = tool?.includedItems ?? [];
  const hasItems = includedItems.length > 0;
  const hasSafety = (tool?.safetyRules?.length ?? 0) > 0;

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        const [reservationRes, paymentRes] = await Promise.all([
          authFetch(`/api/reservations/${params.reservationId}`, { token }),
          authFetch(`/api/payments/paybox?reservationId=${params.reservationId}`, { token }),
        ]);

        if (!reservationRes.ok) {
          const data = await reservationRes.json();
          throw new Error(data.error ?? "השריון לא נמצא");
        }

        const data = await reservationRes.json();
        const checkoutGate = canStartCheckout(data.reservation, data.tool);
        if (!checkoutGate.allowed) {
          throw new Error(checkoutGate.reason);
        }

        setReservation(data.reservation);
        setTool(data.tool);

        const toolHasItems = (data.tool?.includedItems?.length ?? 0) > 0;
        const toolHasSafety = (data.tool?.safetyRules?.length ?? 0) > 0;
        if (data.reservation.feeAmount === 0) {
          setStep(stepAfterPayment(toolHasItems, toolHasSafety));
        } else if (paymentRes.ok) {
          const paymentData = await paymentRes.json();
          if (paymentData.paid) {
            setStep(stepAfterPayment(toolHasItems, toolHasSafety));
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "שגיאה בטעינה");
      }
    }
    load();
  }, [params.reservationId, getIdToken]);

  function handleQrScan(code: string) {
    if (!tool) return;
    if (code === tool.qrCode) {
      setStep(stepAfterQr(hasItems, hasSafety));
      setError("");
    } else {
      setError("קוד ה-QR לא תואם לכלי זה. סרקו את המדבקה הנכונה.");
    }
  }

  async function handleActivateLoan() {
    if (!photoFile || !reservation) return;
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const compressed = await compressImageFile(photoFile);
      const formData = new FormData();
      formData.append("reservationId", reservation.id);
      formData.append("photo", compressed, "checkout.jpg");
      formData.append("checkoutConditionNotes", conditionNotes);
      formData.append("checkoutItemsChecked", JSON.stringify(checkedItems));

      const res = await authFetch("/api/loans/checkout", {
        method: "POST",
        token,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "הלקיחה נכשלה");
      }

      setStep("done");
      setTimeout(() => router.push("/my-loans?pickedUp=1"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (!reservation || !tool) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const baseSteps = [
    ...(hasItems ? [{ key: "items", label: "מה בערכה" }] : []),
    ...(hasSafety ? [{ key: "safety", label: "בטיחות" }] : []),
    { key: "condition", label: "מצב הכלי" },
    { key: "photo", label: "צילום" },
    { key: "done", label: "סיום" },
  ];

  const steps =
    reservation.feeAmount === 0
      ? [
          ...(REQUIRE_QR_SCAN ? [{ key: "qr", label: "סריקת QR" }] : []),
          ...baseSteps,
        ]
      : [{ key: "payment", label: "תשלום" }, ...(REQUIRE_QR_SCAN ? [{ key: "qr", label: "סריקת QR" }] : []), ...baseSteps];

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-lg px-0">
      <PageHeader
        title={`לקיחה: ${tool.name}`}
        description="שלב 2 — תשלום (אם נדרש), צ׳ק-ליסט, מצב הכלי, צילום והפעלת ההשאלה."
      />

      <StepProgress steps={steps} currentIndex={stepIndex} />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {step === "payment" && (
        <PayboxPaymentStep
          reservationId={reservation.id}
          amount={reservation.feeAmount}
          toolName={tool.name}
          platform={tool.gemachId === PLATFORM_GEMACH_ID}
          onPaid={() => setStep(stepAfterPayment(hasItems, hasSafety))}
        />
      )}

      {REQUIRE_QR_SCAN && step === "qr" && <QrScanner onScan={handleQrScan} />}

      {step === "items" && hasItems && (
        <ItemChecklist
          items={includedItems}
          title="📦 מה מגיע עם הכלי?"
          description="סמנו שכל הפריטים נמצאים בערכה לפני הלקיחה"
          confirmLabel="כל הפריטים נמצאים — המשך"
          onComplete={(ids) => {
            setCheckedItems(ids);
            setStep(hasSafety ? "safety" : "condition");
          }}
        />
      )}

      {step === "safety" && (
        <SafetyChecklist rules={tool.safetyRules} onComplete={() => setStep("condition")} />
      )}

      {step === "condition" && (
        <ConditionNotes
          label="מצב הכלי בלקיחה"
          placeholder="לדוגמה: שריטה קלה על המארז, הכל עובד תקין…"
          value={conditionNotes}
          onChange={setConditionNotes}
          onContinue={() => setStep("photo")}
          continueLabel="המשך לצילום"
        />
      )}

      {step === "photo" && (
        <div className="space-y-4">
          <PhotoCapture
            label="צלמו את הכלי לפני השימוש"
            onCapture={(file) => setPhotoFile(file)}
          />
          <Button
            type="button"
            disabled={!photoFile || loading}
            onClick={handleActivateLoan}
            className="w-full"
            size="lg"
          >
            {loading ? "מפעיל השאלה…" : "הפעלת השאלה ולקיחת הכלי"}
          </Button>
        </div>
      )}

      {step === "done" && (
        <Card className="border-kerem-200 bg-kerem-50 text-center">
          <CardBody className="py-10">
            <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-kerem-700 text-3xl text-white shadow-lg">
              ✓
            </span>
            <p className="text-xl font-bold text-kerem-900">הכלי שוחרר!</p>
            <p className="mt-2 text-[var(--muted)]">ההשאלה פעילה — אל תשכחו להחזיר ולסגור בטופס ההחזרה.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
