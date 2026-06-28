"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { compressImageFile } from "@/lib/compress-image";
import {
  gemachPricingModeLabels,
  resolveGemachReservationMode,
  resolveGemachDefaultLoanHours,
  resolveGemachMaxLoanHours,
  MAX_LOAN_HOURS_CAP,
} from "@/lib/gemach";
import { MAX_TOOL_UNITS, TOOL_CATEGORIES } from "@/lib/tools-admin";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useAdminGemachId } from "@/hooks/useAdminGemachId";
import { withGemachIdQuery } from "@/lib/gemach-selection";
import type { Gemach } from "@/lib/types";

export default function AddGemachToolPage() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const { gemachId, isPlatformCoopEdit, hrefWithGemachId } = useAdminGemachId();
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJustCreated(params.get("created") === "1");
  }, []);

  const [gemach, setGemach] = useState<Gemach | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(TOOL_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [brand, setBrand] = useState("");
  const [supplier, setSupplier] = useState("");
  const [purpose, setPurpose] = useState("");
  const [productAge, setProductAge] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loanFeeMin, setLoanFeeMin] = useState("20");
  const [loanFeeMax, setLoanFeeMax] = useState("50");
  const [defaultLoanHours, setDefaultLoanHours] = useState("");
  const [maxLoanHours, setMaxLoanHours] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gemachId) return;

    async function loadGemach() {
      try {
        const token = await getIdToken();
        const res = await authFetch(
          `/api/admin/gemach/dashboard?gemachId=${encodeURIComponent(gemachId!)}`,
          { token }
        );
        if (!res.ok) throw new Error("לא ניתן לטעון את הגמ״ח");
        const data = await res.json();
        const g = data.gemach as Gemach | undefined;
        setGemach(g ?? null);
        if (g && resolveGemachReservationMode(g) === "fixed_hours") {
          setDefaultLoanHours(String(resolveGemachDefaultLoanHours(g)));
          setMaxLoanHours(String(resolveGemachMaxLoanHours(g)));
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "שגיאה");
      }
    }
    loadGemach();
  }, [gemachId, getIdToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gemachId) return;
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const resolvedCategory =
        category === "אחר" ? customCategory.trim() || "אחר" : category;

      const res = await authFetch("/api/admin/gemach/tools", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gemachId,
          name,
          description,
          category: resolvedCategory,
          quantity: Number(quantity),
          loanFeeMin: Number(loanFeeMin),
          loanFeeMax: Number(loanFeeMax),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(brand.trim() ? { brand: brand.trim() } : {}),
          ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
          ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
          ...(productAge.trim() ? { productAge: Number(productAge) } : {}),
          ...(showLoanHours && defaultLoanHours.trim()
            ? { defaultLoanHours: Number(defaultLoanHours) }
            : {}),
          ...(showLoanHours && maxLoanHours.trim()
            ? { maxLoanHours: Number(maxLoanHours) }
            : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "הוספת הכלי נכשלה");
      }

      if (imageFile && data.kindId) {
        const compressed = await compressImageFile(imageFile);
        const formData = new FormData();
        formData.append("gemachId", gemachId);
        formData.append("image", compressed, "tool.jpg");
        const imgRes = await authFetch(
          `/api/admin/gemach/tools/${encodeURIComponent(data.kindId)}/image`,
          { method: "POST", token, body: formData }
        );
        if (!imgRes.ok) {
          const imgData = await imgRes.json();
          throw new Error(imgData.error ?? "הכלי נוסף אך העלאת התמונה נכשלה");
        }
      }

      router.push(
        isPlatformCoopEdit
          ? "/admin"
          : withGemachIdQuery(`/admin/gemach?toolsAdded=${data.tools.length}`, gemachId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  if (!gemachId) {
    return (
      <div className="mx-auto max-w-md py-12">
        <Alert variant="warning">אין גמ״ח משויך לחשבון שלכם.</Alert>
        <Link href="/gemach/new" className="mt-4 block text-center font-semibold text-kerem-700">
          צרו גמ״ח קודם
        </Link>
      </div>
    );
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;

  const showFees = gemach?.pricingMode === "loan_fee";
  const isFree = gemach?.pricingMode === "free";
  const showLoanHours = gemach ? resolveGemachReservationMode(gemach) === "fixed_hours" : false;

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href={isPlatformCoopEdit ? "/admin" : hrefWithGemachId("/admin/gemach")}>
        {isPlatformCoopEdit ? "חזרה ללוח פלטפורמה" : "חזרה ללוח הבקרה"}
      </BackLink>

      <PageHeader
        title={isPlatformCoopEdit ? "הוספת כלי לקואופרטיב" : "הוספת כלי לגמ״ח"}
        description={
          gemach
            ? `${gemach.name} · ${gemachPricingModeLabels[gemach.pricingMode]}`
            : "טוען…"
        }
      />

      {justCreated && (
        <Alert variant="success" className="mb-6">
          <p className="font-semibold">הגמ״ח נוצר! עכשיו הוסיפו את הכלים הראשונים.</p>
        </Alert>
      )}

      <Card className="shadow-md">
        <div className="h-1.5 bg-gradient-to-l from-kerem-500 to-kerem-700" />
        <CardBody className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}

            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-stone-800">
                שם הכלי *
              </label>
              <input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="לדוגמה: עגלת תינוק"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-1.5 block text-sm font-semibold text-stone-800"
              >
                תיאור *
              </label>
              <textarea
                id="description"
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="מה הכלי, למה הוא מתאים?"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-semibold text-stone-800">
                מיקום איסוף / אחסון
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={
                  gemach?.location
                    ? `ריק = ${gemach.location}`
                    : "לדוגמה: מחסן קרem, רח' …"
                }
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
              {gemach?.location && !location.trim() && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  ברירת מחדל מהגמ״ח: {gemach.location}
                </p>
              )}
            </div>

            <fieldset className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/30 p-4">
              <legend className="px-1 text-sm font-bold text-stone-900">
                פרטי עמוד הכלי (אופציונלי)
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="brand" className="mb-1 block text-sm font-semibold text-stone-800">
                    מותג
                  </label>
                  <input
                    id="brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="supplier" className="mb-1 block text-sm font-semibold text-stone-800">
                    ספק
                  </label>
                  <input
                    id="supplier"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="purpose" className="mb-1 block text-sm font-semibold text-stone-800">
                  ייעוד
                </label>
                <input
                  id="purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="למשל: אירועים, גינון…"
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="productAge" className="mb-1 block text-sm font-semibold text-stone-800">
                  גיל המוצר (שנים)
                </label>
                <input
                  id="productAge"
                  type="number"
                  min={0}
                  value={productAge}
                  onChange={(e) => setProductAge(e.target.value)}
                  className="w-full max-w-[8rem] rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm"
                />
              </div>
            </fieldset>

            <div>
              <label htmlFor="category" className="mb-1.5 block text-sm font-semibold text-stone-800">
                קטגוריה *
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              >
                {TOOL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {category === "אחר" && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="שם קטגוריה מותאם (למשל: ציוד לאירועים)"
                  className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-stone-800">
                תמונה (אופציונלי)
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt="תצוגה מקדימה"
                    className="h-28 w-28 rounded-xl border border-[var(--border)] object-cover"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-warm-50 text-2xl text-[var(--muted)]">
                    📷
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl border border-kerem-200 bg-kerem-50 px-4 py-2 text-sm font-semibold text-kerem-800 hover:bg-kerem-100"
                  >
                    {imagePreview ? "החלף תמונה" : "העלה תמונה"}
                  </button>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-xs font-medium text-red-700 hover:underline"
                    >
                      הסר תמונה
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="quantity" className="mb-1.5 block text-sm font-semibold text-stone-800">
                כמה יחידות מאותו סוג? *
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                max={MAX_TOOL_UNITS}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                עד {MAX_TOOL_UNITS} יחידות מאותו סוג (למשל 150 כיסאות). כל שריון הוא יחידה אחת — לכמות
                גדולה יש לבצע מספר שריונים.
              </p>
            </div>

            {isFree && (
              <Alert variant="info">הגמ״ח שלכם במודל חינם — לא ייגבו דמי השאלה על כלי זה.</Alert>
            )}

            {gemach?.pricingMode === "maintenance_only" && (
              <Alert variant="info">
                מודל תחזוקה בלבד — דמי השאלה לפי הגדרת הגמ״ח, לא לפי כלי.
              </Alert>
            )}

            {showFees && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="loanFeeMin"
                    className="mb-1.5 block text-sm font-semibold text-stone-800"
                  >
                    דמי השאלה מינימום (₪)
                  </label>
                  <input
                    id="loanFeeMin"
                    type="number"
                    min={0}
                    value={loanFeeMin}
                    onChange={(e) => setLoanFeeMin(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                  />
                </div>
                <div>
                  <label
                    htmlFor="loanFeeMax"
                    className="mb-1.5 block text-sm font-semibold text-stone-800"
                  >
                    מקסימום (₪)
                  </label>
                  <input
                    id="loanFeeMax"
                    type="number"
                    min={0}
                    value={loanFeeMax}
                    onChange={(e) => setLoanFeeMax(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                  />
                </div>
              </div>
            )}

            {showLoanHours && (
              <fieldset className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
                <legend className="px-1 text-sm font-bold text-stone-900">⏱ משך השאלה</legend>
                <p className="text-xs text-[var(--muted)]">
                  כמה זמן השואלים יכולים לשאול כלי זה (מצב השאלה לפי שעות).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="defaultLoanHours"
                      className="mb-1.5 block text-sm font-semibold text-stone-800"
                    >
                      ברירת מחדל (שעות)
                    </label>
                    <input
                      id="defaultLoanHours"
                      type="number"
                      min={1}
                      max={MAX_LOAN_HOURS_CAP}
                      value={defaultLoanHours}
                      onChange={(e) => setDefaultLoanHours(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="maxLoanHours"
                      className="mb-1.5 block text-sm font-semibold text-stone-800"
                    >
                      מקסימום (שעות)
                    </label>
                    <input
                      id="maxLoanHours"
                      type="number"
                      min={1}
                      max={MAX_LOAN_HOURS_CAP}
                      value={maxLoanHours}
                      onChange={(e) => setMaxLoanHours(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                    />
                  </div>
                </div>
              </fieldset>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "מוסיף…" : "הוסף לרשימת הכלים"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
