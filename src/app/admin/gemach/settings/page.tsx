"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import {
  gemachPricingModeLabels,
  gemachRequiresPaybox,
  gemachReservationModeLabels,
  gemachReservationModeHints,
} from "@/lib/gemach";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Gemach, GemachPricingMode, GemachReservationMode } from "@/lib/types";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";

const reservationModeOptions: { value: GemachReservationMode; hint: string }[] = [
  { value: "date_range", hint: gemachReservationModeHints.date_range },
  { value: "fixed_hours", hint: gemachReservationModeHints.fixed_hours },
];

const pricingOptions: { value: GemachPricingMode; hint: string }[] = [
  { value: "free", hint: "השאלה ללא תשלום — מתאים לגמ״חים קהילתיים" },
  { value: "loan_fee", hint: "דמי השאלה לפי כל כלי (כמו בכרם רעים)" },
  { value: "maintenance_only", hint: "סכום קבוע לתחזוקה בלבד" },
];

export default function GemachSettingsPage() {
  const router = useRouter();
  const { getIdToken, refreshMember } = useAuth();
  const { gemachId } = useSelectedGemachId();

  const [gemach, setGemach] = useState<Gemach | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [pricingMode, setPricingMode] = useState<GemachPricingMode>("free");
  const [reservationMode, setReservationMode] = useState<GemachReservationMode>("date_range");
  const [maintenanceFee, setMaintenanceFee] = useState("");
  const [payboxGroupUrl, setPayboxGroupUrl] = useState("");
  const [cooperativeFee, setCooperativeFee] = useState("");
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
        if (g) {
          setName(g.name);
          setDescription(g.description ?? "");
          setLocation(g.location ?? "");
          setPricingMode(g.pricingMode);
          setReservationMode(g.reservationMode ?? "date_range");
          setMaintenanceFee(
            g.maintenanceFee !== undefined ? String(g.maintenanceFee) : ""
          );
          setPayboxGroupUrl(g.payboxGroupUrl ?? "");
          setCooperativeFee(g.cooperativeFee !== undefined ? String(g.cooperativeFee) : "");
        }
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

    const coop =
      pricingMode === "free" && cooperativeFee.trim()
        ? Math.max(0, Number(cooperativeFee) || 0)
        : 0;

    if (pricingMode === "free" && coop > 0 && !payboxGroupUrl.trim()) {
      setError("גמ״ח חינמי עם דמי קואופרטיב דורש קישור PayBox");
      setSaving(false);
      return;
    }

    if (gemachRequiresPaybox(pricingMode) && !payboxGroupUrl.trim()) {
      setError("נדרש קישור PayBox לתשלומים");
      setSaving(false);
      return;
    }

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/gemach", {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gemachId,
          name: name.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          pricingMode,
          reservationMode,
          maintenanceFee:
            pricingMode === "maintenance_only" ? Number(maintenanceFee || 0) : null,
          payboxGroupUrl: payboxGroupUrl.trim() || null,
          cooperativeFee:
            pricingMode === "free"
              ? cooperativeFee.trim() === ""
                ? null
                : Math.max(0, Number(cooperativeFee) || 0)
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      setGemach(data.gemach);
      setName(data.gemach.name);
      setDescription(data.gemach.description ?? "");
      setPricingMode(data.gemach.pricingMode);
      setReservationMode(data.gemach.reservationMode ?? "date_range");
      setPayboxGroupUrl(data.gemach.payboxGroupUrl ?? "");
      setCooperativeFee(
        data.gemach.cooperativeFee !== undefined ? String(data.gemach.cooperativeFee) : ""
      );
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

  const needsPaybox = gemachRequiresPaybox(pricingMode);

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin/gemach">חזרה ללוח הבקרה</BackLink>

      <PageHeader
        title="הגדרות גמ״ח"
        description={
          gemach
            ? `${gemach.slug} · ${gemachPricingModeLabels[gemach.pricingMode]}`
            : ""
        }
      />

      <Card className="shadow-md mb-8">
        <CardBody className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && !showCloseConfirm && <Alert variant="error">{error}</Alert>}
            {success && <Alert variant="success">ההגדרות נשמרו</Alert>}

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-stone-800">
                שם הגמ״ח *
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-1.5 block text-sm font-semibold text-stone-800"
              >
                תיאור קצר
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="מה מציע הגמ״ח שלכם?"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-semibold text-stone-800">
                מיקום אחסון / איסוף (ברירת מחדל לכלים)
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="לדוגמה: מחסן קהילתי, רח' …"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                יוצג בקטלוג ובעמוד הכלי — ניתן לדרוס לכל כלי בנפרד.
              </p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-stone-800">מודל תמחור *</legend>
              <div className="space-y-2">
                {pricingOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                      pricingMode === option.value
                        ? "border-kerem-500 bg-kerem-50 ring-1 ring-kerem-200"
                        : "border-[var(--border)] hover:bg-warm-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pricingMode"
                      value={option.value}
                      checked={pricingMode === option.value}
                      onChange={() => setPricingMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-stone-900">
                        {gemachPricingModeLabels[option.value]}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-stone-800">מודל שמירה *</legend>
              <div className="space-y-2">
                {reservationModeOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                      reservationMode === option.value
                        ? "border-kerem-500 bg-kerem-50 ring-1 ring-kerem-200"
                        : "border-[var(--border)] hover:bg-warm-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reservationMode"
                      value={option.value}
                      checked={reservationMode === option.value}
                      onChange={() => setReservationMode(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-stone-900">
                        {gemachReservationModeLabels[option.value]}
                      </span>
                      <span className="block text-xs text-[var(--muted)]">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {pricingMode === "maintenance_only" && (
              <div>
                <label
                  htmlFor="maintenanceFee"
                  className="mb-1.5 block text-sm font-semibold text-stone-800"
                >
                  דמי תחזוקה (₪)
                </label>
                <input
                  id="maintenanceFee"
                  type="number"
                  min={0}
                  step={1}
                  value={maintenanceFee}
                  onChange={(e) => setMaintenanceFee(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
            )}

            {pricingMode === "free" && (
              <>
                <div>
                  <label
                    htmlFor="payboxDonation"
                    className="mb-1.5 block text-sm font-semibold text-stone-800"
                  >
                    קישור PayBox לתרומות (אופציונלי)
                  </label>
                  <input
                    id="payboxDonation"
                    type="url"
                    dir="ltr"
                    value={payboxGroupUrl}
                    onChange={(e) => setPayboxGroupUrl(e.target.value)}
                    placeholder="https://payboxapp.com/..."
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    קישור לקבוצת PayBox לתרומות — גם משמש לגביית דמי קואופרטיב אם הוגדרו.
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="cooperativeFee"
                    className="mb-1.5 block text-sm font-semibold text-stone-800"
                  >
                    דמי קואופרטיב ליחידה (₪, אופציונלי)
                  </label>
                  <input
                    id="cooperativeFee"
                    type="number"
                    min={0}
                    step={1}
                    value={cooperativeFee}
                    onChange={(e) => setCooperativeFee(e.target.value)}
                    placeholder="0 = השאלה חינם לגמרי"
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    אם גובים דמי קואופרטיב — חובה להזין קישור PayBox למעלה.
                  </p>
                </div>
              </>
            )}

            {needsPaybox && (
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
                <p className="mt-1 text-xs text-[var(--muted)]">
                  התשלומים על כלי הגמ״ח יועברו לקבוצת PayBox זו (HTTPS בלבד).
                </p>
              </div>
            )}

            <Button type="submit" size="lg" disabled={saving} className="w-full">
              {saving ? "שומר…" : "שמור הגדרות"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="border-red-200 shadow-md">
        <CardBody className="pt-6">
          <h2 className="text-lg font-bold text-red-800">מחיקת גמ״ח לצמיתות</h2>
          <p className="mt-2 text-sm text-stone-600">
            פעולה זו אינה ניתנת לביטול. הגמ״ח וכל הכלים שלו יימחקו מהמערכת, שריונים פעילות יבוטלו,
            והחשבון שלכם יחזור לתפקיד «חבר» (אלא אם יש לכם גמ״ח נוסף או הרשאות מנהל). יש להחזיר כל
            השאלה פעילה לפני המחיקה.
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
                הקלידו את שם הגמ״ח לאישור: <strong>{gemach?.name}</strong>
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
