"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { QrScanner } from "@/components/loan/QrScanner";
import { PhotoCapture } from "@/components/loan/PhotoCapture";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepProgress } from "@/components/ui/StepProgress";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import type { Loan, Tool } from "@/lib/types";

type Step = "qr" | "photo" | "done";

export default function ReturnPage() {
  const params = useParams<{ loanId: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [loan, setLoan] = useState<Loan | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("qr");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [faultDescription, setFaultDescription] = useState("");
  const [error, setError] = useState("");
  const [faultReported, setFaultReported] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch(`/api/loans/${params.loanId}`, { token });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "ההשאלה לא נמצאה");
        }
        const data = await res.json();
        setLoan(data.loan);
        setTool(data.tool);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "שגיאה בטעינה");
      }
    }
    load();
  }, [params.loanId, getIdToken]);

  function handleQrScan(code: string) {
    if (!tool) return;
    if (code === tool.qrCode) {
      setStep("photo");
      setError("");
    } else {
      setError("קוד ה-QR לא תואם. סרקו את המדבקה על הכלי שמוחזר.");
    }
  }

  async function handleReturn() {
    if (!photoFile || !loan) return;
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append("loanId", loan.id);
      formData.append("photo", photoFile);

      const res = await authFetch("/api/loans/return", {
        method: "POST",
        token,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "ההחזרה נכשלה");
      }

      setStep("done");
      setTimeout(() => router.push("/my-loans"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  async function handleReportFault(e: React.FormEvent) {
    e.preventDefault();
    if (!tool || !loan) return;
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/maintenance", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId: tool.id,
          loanId: loan.id,
          description: faultDescription,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "דיווח התקלה נכשל");
      }

      setShowFaultForm(false);
      setFaultDescription("");
      setFaultReported(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (!loan || !tool) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const steps = [
    { key: "qr", label: "סריקת QR" },
    { key: "photo", label: "צילום" },
    { key: "done", label: "סיום" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={`החזרה: ${tool.name}`}
        description="החזירו את הכלי למקומו, סרקו QR, וצלמו אותו נקי ובמקום."
      />

      <StepProgress steps={steps} currentIndex={stepIndex} />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {faultReported && (
        <Alert variant="warning" className="mb-4">
          התקלה דווחה. הכלי הושבת עד לבדיקה.
        </Alert>
      )}

      {step === "qr" && <QrScanner onScan={handleQrScan} />}

      {step === "photo" && (
        <div className="space-y-4">
          <PhotoCapture
            label="צלמו את הכלי בעת ההחזרה"
            onCapture={(file) => setPhotoFile(file)}
          />
          <Button
            type="button"
            disabled={!photoFile || loading}
            onClick={handleReturn}
            className="w-full"
            size="lg"
          >
            {loading ? "מעבד החזרה…" : "אישור החזרה"}
          </Button>
        </div>
      )}

      {step === "done" && (
        <Card className="border-kerem-200 bg-kerem-50 text-center">
          <CardBody className="py-10">
            <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-kerem-700 text-3xl text-white">
              ✓
            </span>
            <p className="text-xl font-bold text-kerem-900">ההחזרה אושרה!</p>
            <p className="mt-2 text-[var(--muted)]">תודה שהחזרתם את הכלי.</p>
          </CardBody>
        </Card>
      )}

      <div className="mt-8">
        {!showFaultForm ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowFaultForm(true)}
            className="w-full border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"
          >
            ⚠️ דיווח על תקלה / בלאי
          </Button>
        ) : (
          <Card className="border-orange-200">
            <CardBody>
              <h3 className="mb-3 font-bold text-orange-900">דיווח על בעיה</h3>
              <form onSubmit={handleReportFault} className="space-y-3">
                <textarea
                  required
                  value={faultDescription}
                  onChange={(e) => setFaultDescription(e.target.value)}
                  placeholder="תארו את התקלה או הבלאי שמצאתם…"
                  rows={3}
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowFaultForm(false)}
                    className="flex-1"
                  >
                    ביטול
                  </Button>
                  <Button type="submit" variant="danger" disabled={loading} className="flex-1">
                    שליחת דיווח
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
