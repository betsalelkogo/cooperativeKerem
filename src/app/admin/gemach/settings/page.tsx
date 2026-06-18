"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { gemachPricingModeLabels, gemachRequiresPaybox } from "@/lib/gemach";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Gemach } from "@/lib/types";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";

export default function GemachSettingsPage() {
  const router = useRouter();
  const { member, getIdToken, refreshMember } = useAuth();
  const { gemachId } = useSelectedGemachId();

  const [gemach, setGemach] = useState<Gemach | null>(null);
  const [payboxGroupUrl, setPayboxGroupUrl] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  useEffect(() => {
    if (!gemachId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch(
          `/api/admin/gemach/dashboard?gemachId=${encodeURIComponent(gemachId!)}`,
          { token }
        );
        if (!res.ok) throw new Error("טעינה נכשלה");
        const data = await res.json();
        const g = data.gemach as Gemach | undefined;
        setGemach(g ?? null);
        setPayboxGroupUrl(g?.payboxGroupUrl ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gemachId, getIdToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gemachId || !gemach) return;
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/gemach", {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gemachId,
          payboxGroupUrl: payboxGroupUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      setGemach(data.gemach);
      setPayboxGroupUrl(data.gemach.payboxGroupUrl ?? "");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseGemach() {
    if (!gemachId || !gemach) return;
    setClosing(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/gemach/close", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemachId, confirmName: confirmName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "סגירה נכשלה");
      await refreshMember();
      setShowCloseConfirm(false);
      router.push("/tools");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setClosing(false);
    }
  }

  if (!gemachId && !loading) {
    return (
      <div className="mx-auto max-w-md py-12">
        <Alert variant="warning">אין גמ״ח משויך לחשבון.</Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const needsPaybox = gemach && gemachRequiresPaybox(gemach.pricingMode);

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin/gemach">חזרה ללוח הבקרה</BackLink>

      <PageHeader
        title="הגדרות גמ״ח"
        description={
          gemach
            ? `${gemach.name} · ${gemachPricingModeLabels[gemach.pricingMode]}`
            : ""
        }
      />

      <Card className="shadow-md mb-8">
        <CardBody className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && !showCloseConfirm && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">ההגדרות נשמרו</Alert>}

            {needsPaybox ? (
              <div>
                <label
                  htmlFor="payboxGroupUrl"
                  className="mb-1.5 block text-sm font-semibold text-stone-800"
                >
                  קישור PayBox לתשלומים *
                </label>
                <input
                  id="payboxGroupUrl"
                  type="url"
                  required
                  dir="ltr"
                  value={payboxGroupUrl}
                  onChange={(e) => setPayboxGroupUrl(e.target.value)}
                  placeholder="https://payboxapp.com/..."
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
            ) : !needsPaybox ? (
              <p className="text-sm text-[var(--muted)]">
                הגמ״ח שלכם במודל «חינם» — אין צורך בקישור PayBox.
              </p>
            ) : null}

            {needsPaybox && (
              <Button type="submit" size="lg" disabled={saving} className="w-full">
                {saving ? "שומר…" : "שמור הגדרות"}
              </Button>
            )}
          </form>
        </CardBody>
      </Card>

      <Card className="border-red-200 shadow-md">
          <CardBody className="pt-6">
            <h2 className="text-lg font-bold text-red-800">מחיקת גמ״ח לצמיתות</h2>
            <p className="mt-2 text-sm text-stone-600">
              פעולה זו אינה ניתנת לביטול. הגמ״ח וכל הכלים שלו יימחקו מהמערכת, שמירות פעילות יבוטלו, והחשבון שלכם יחזור לתפקיד «חבר» (אלא אם יש לכם גמ״ח נוסף או הרשאות מנהל). יש להחזיר כל השאלה פעילה לפני המחיקה.
            </p>

            {!showCloseConfirm ? (
              <Button
                type="button"
                variant="danger"
                className="mt-4 w-full"
                onClick={() => {
                  setShowCloseConfirm(true);
                  setError("");
                }}
              >
                מחק את הגמ״ח לצמיתות
              </Button>
            ) : (
              <div className="mt-4 space-y-3">
                {error && <Alert variant="error">{error}</Alert>}
                <p className="text-sm font-medium text-stone-800">
                  הקלידו את שם הגמ״ח לאישור:{" "}
                  <strong>{gemach?.name}</strong>
                </p>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm"
                  placeholder="שם הגמ״ח"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    className="flex-1"
                    disabled={closing || confirmName.trim() !== gemach?.name.trim()}
                    onClick={handleCloseGemach}
                  >
                    {closing ? "מוחק…" : "אישור — מחק לצמיתות"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    disabled={closing}
                    onClick={() => {
                      setShowCloseConfirm(false);
                      setConfirmName("");
                      setError("");
                    }}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
    </div>
  );
}
