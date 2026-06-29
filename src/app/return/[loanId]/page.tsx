"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { ItemChecklist, ConditionNotes } from "@/components/loan/ItemChecklist";
import { PhotoCapture } from "@/components/loan/PhotoCapture";
import { QrScanner } from "@/components/loan/QrScanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepProgress } from "@/components/ui/StepProgress";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { compressImageFile } from "@/lib/compress-image";
import { REQUIRE_QR_SCAN } from "@/lib/features";
import { DEFECT_CATEGORIES } from "@/lib/defects";
import type { DefectCategory, LateReturnFee, Loan, Tool } from "@/lib/types";
import { formatLateDuration } from "@/lib/late-fees";
import { formatNIS } from "@/lib/pots";

type Step = "qr" | "items" | "condition" | "photo" | "done";

function initialStep(hasItems: boolean): Step {
  if (REQUIRE_QR_SCAN) return "qr";
  return hasItems ? "items" : "condition";
}

export default function ReturnPage() {
  const params = useParams<{ loanId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { getIdToken } = useAuth();

  const loanIds = useMemo(() => {
    const raw = searchParams.get("loanIds");
    const ids = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    return ids.length > 0 ? ids : [params.loanId];
  }, [searchParams, params.loanId]);
  const groupCount = loanIds.length;

  const [loan, setLoan] = useState<Loan | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState<Step>("condition");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [conditionNotes, setConditionNotes] = useState("");
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFaultForm, setShowFaultForm] = useState(false);
  const [faultCategory, setFaultCategory] = useState<DefectCategory>("broken");
  const [faultDescription, setFaultDescription] = useState("");
  const [returnHasDefect, setReturnHasDefect] = useState(false);
  const [error, setError] = useState("");
  const [faultReported, setFaultReported] = useState(false);
  const [lateFee, setLateFee] = useState<LateReturnFee | null>(null);

  const includedItems = tool?.includedItems ?? [];
  const hasItems = includedItems.length > 0;

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
        setStep(initialStep((data.tool?.includedItems?.length ?? 0) > 0));
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "שגיאה בטעינה");
      }
    }
    load();
  }, [params.loanId, getIdToken]);

  function handleQrScan(code: string) {
    if (!tool) return;
    if (code === tool.qrCode) {
      setStep(hasItems ? "items" : "condition");
      setError("");
    } else {
      setError("קוד ה-QR לא תואם. סרקו את המדבקה על הכלי שמוחזר.");
    }
  }

  async function handleCloseLoan() {
    if (!photoFile || !loan) return;
    if (returnHasDefect && !faultDescription.trim()) {
      setError("נא לתאר את התקלה לפני סגירת ההשאלה");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const compressed = await compressImageFile(photoFile);
      const formData = new FormData();
      formData.append("loanId", loan.id);
      if (groupCount > 1) {
        formData.append("loanIds", JSON.stringify(loanIds));
      }
      formData.append("photo", compressed, "return.jpg");
      formData.append("returnConditionNotes", conditionNotes);
      formData.append("returnItemsChecked", JSON.stringify(checkedItems));
      formData.append("returnOk", returnHasDefect ? "false" : "true");
      if (returnHasDefect && faultDescription.trim()) {
        formData.append(
          "returnDefect",
          JSON.stringify({
            category: faultCategory,
            description: faultDescription.trim(),
            responsibility: "unknown",
            reportedAt: new Date().toISOString(),
          })
        );
      }

      const res = await authFetch("/api/loans/return", {
        method: "POST",
        token,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "סגירת ההשאלה נכשלה");
      }

      const data = await res.json();
      if (data.lateFee) {
        setLateFee(data.lateFee as LateReturnFee);
      }

      setStep("done");
      setTimeout(() => router.push("/my-loans?returned=1"), 2000);
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

  if (loan.status !== "active") {
    return (
      <Alert variant="warning">
        ההשאלה כבר לא פעילה — לא ניתן לסגור אותה שוב.
      </Alert>
    );
  }

  const steps = [
    ...(REQUIRE_QR_SCAN ? [{ key: "qr", label: "סריקת QR" }] : []),
    ...(hasItems ? [{ key: "items", label: "מה בערכה" }] : []),
    { key: "condition", label: "מצב הכלי" },
    { key: "photo", label: "צילום" },
    { key: "done", label: "סגירה" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);
  // A single multi-unit loan carries its own quantity; legacy bookings span docs.
  const displayCount = Math.max(groupCount, loan.quantity ?? 1);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title={
          displayCount > 1
            ? `סגירת השאלה: ${tool.name} (${displayCount} יחידות)`
            : `סגירת השאלה: ${tool.name}`
        }
        description={
          displayCount > 1
            ? "סגירת כל היחידות יחד — צ׳ק-ליסט, מצב הכלי וצילום אחד שמשותף לכולן."
            : "ההשאלה נשארת פעילה עד שתשלימו את טופס ההחזרה — צ׳ק-ליסט, מצב הכלי וצילום."
        }
      />

      <Alert variant="info" className="mb-4">
        סטטוס נוכחי: <strong>פעיל</strong> — ישתנה ל«הוחזר» רק לאחר אישור טופס הסגירה.
      </Alert>

      <StepProgress steps={steps} currentIndex={stepIndex} />

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {faultReported && (
        <Alert variant="warning" className="mb-4">
          התקלה דווחה. הכלי ייבדק לאחר סגירת ההשאלה.
        </Alert>
      )}

      {REQUIRE_QR_SCAN && step === "qr" && <QrScanner onScan={handleQrScan} />}

      {step === "items" && hasItems && (
        <ItemChecklist
          items={includedItems}
          title="📦 החזרת כל הפריטים"
          description="סמנו שכל הפריטים שקיבלתם חוזרים עם הכלי"
          confirmLabel="כל הפריטים הוחזרו — המשך"
          onComplete={(ids) => {
            setCheckedItems(ids);
            setStep("condition");
          }}
        />
      )}

      {step === "condition" && (
        <div className="space-y-4">
          <ConditionNotes
            label="מצב הכלי בהחזרה"
            placeholder="לדוגמה: ניקוי בסיסי, ללא נזקים חדשים…"
            value={conditionNotes}
            onChange={setConditionNotes}
            onContinue={() => setStep("photo")}
            continueLabel="המשך לצילום"
          />
          <Card className="border-[var(--border)]">
            <CardBody className="space-y-3">
              <p className="text-sm font-bold text-stone-900">האם הכלי הוחזר תקין?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={!returnHasDefect ? "primary" : "secondary"}
                  className="flex-1"
                  onClick={() => {
                    setReturnHasDefect(false);
                    setShowFaultForm(false);
                  }}
                >
                  כן — תקין
                </Button>
                <Button
                  type="button"
                  variant={returnHasDefect ? "primary" : "secondary"}
                  className="flex-1"
                  onClick={() => {
                    setReturnHasDefect(true);
                    setShowFaultForm(true);
                  }}
                >
                  יש תקלה
                </Button>
              </div>
              {returnHasDefect && showFaultForm && (
                <div className="space-y-3 border-t border-[var(--border)] pt-3">
                  <select
                    value={faultCategory}
                    onChange={(e) => setFaultCategory(e.target.value as DefectCategory)}
                    className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    {DEFECT_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    required
                    value={faultDescription}
                    onChange={(e) => setFaultDescription(e.target.value)}
                    placeholder="תארו את התקלה…"
                    rows={3}
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
                  />
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {step === "photo" && (
        <div className="space-y-4">
          <PhotoCapture
            label="צלמו את הכלי בעת ההחזרה"
            onCapture={(file) => setPhotoFile(file)}
          />
          <Button
            type="button"
            disabled={!photoFile || loading}
            onClick={handleCloseLoan}
            className="w-full"
            size="lg"
          >
            {loading ? "סוגר השאלה…" : "אישור החזרה וסגירת ההשאלה"}
          </Button>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4">
          {lateFee && (
            <Alert variant="warning">
              <p className="font-bold text-orange-900">⚠️ החזרה באיחור</p>
              <p className="mt-2 text-sm">
                החזרתם את הכלי באיחור של{" "}
                <strong>{formatLateDuration(lateFee.lateMinutes)}</strong>.
              </p>
              <p className="mt-1 text-sm">
                ייגבה קנס של <strong>{formatNIS(lateFee.amount)}</strong> — נא לשלם בהתאם להנחיות
                הקואופרטיב. מנהל המערכת יעקוב אחר התשלום.
              </p>
            </Alert>
          )}
          <Card className="border-kerem-200 bg-kerem-50 text-center">
            <CardBody className="py-10">
              <span className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-kerem-700 text-3xl text-white">
                ✓
              </span>
              <p className="text-xl font-bold text-kerem-900">ההשאלה נסגרה!</p>
              <p className="mt-2 text-[var(--muted)]">תודה שהחזרתם את הכלי.</p>
            </CardBody>
          </Card>
        </div>
      )}

      {step !== "done" && (
        <div className="mt-8">
          {!showFaultForm ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowFaultForm(true)}
              className="w-full border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100"
            >
              ⚠️ דיווח על תקלה / בלאי (במקביל לסגירה)
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
      )}
    </div>
  );
}
