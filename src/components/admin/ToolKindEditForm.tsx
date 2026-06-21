"use client";

import { useRef, useState } from "react";
import { authFetch } from "@/lib/api-client";
import { compressImageFile } from "@/lib/compress-image";
import { gemachPricingModeLabels, MAX_LOAN_HOURS_CAP } from "@/lib/gemach";
import { TOOL_CATEGORIES } from "@/lib/tools-admin";
import { resolveToolImageUrl, validateToolImageUrl } from "@/lib/tool-image";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { AdminToolKindEdit } from "@/lib/types";

interface ToolKindEditFormProps {
  kind: AdminToolKindEdit;
  gemachId: string;
  gemachDefaultLocation?: string;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
}

export function ToolKindEditForm({
  kind,
  gemachId,
  gemachDefaultLocation,
  getToken,
  onSaved,
}: ToolKindEditFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(kind.name);
  const [description, setDescription] = useState(kind.description);
  const initialCategoryInList = TOOL_CATEGORIES.includes(
    kind.category as (typeof TOOL_CATEGORIES)[number]
  );
  const [category, setCategory] = useState(
    initialCategoryInList ? kind.category : "אחר"
  );
  const [customCategory, setCustomCategory] = useState(
    initialCategoryInList ? "" : kind.category
  );
  const [loanFeeMin, setLoanFeeMin] = useState(String(kind.loanFeeMin));
  const [loanFeeMax, setLoanFeeMax] = useState(String(kind.loanFeeMax));
  const [defaultLoanHours, setDefaultLoanHours] = useState(
    kind.defaultLoanHours !== undefined ? String(kind.defaultLoanHours) : ""
  );
  const [maxLoanHours, setMaxLoanHours] = useState(
    kind.maxLoanHours !== undefined ? String(kind.maxLoanHours) : ""
  );
  const [adminNotes, setAdminNotes] = useState(kind.adminNotes ?? "");
  const [location, setLocation] = useState(kind.location ?? "");
  const [brand, setBrand] = useState(kind.brand ?? "");
  const [supplier, setSupplier] = useState(kind.supplier ?? "");
  const [purpose, setPurpose] = useState(kind.purpose ?? "");
  const [productAge, setProductAge] = useState(
    kind.productAge !== undefined ? String(kind.productAge) : ""
  );
  const [extraImageUrls, setExtraImageUrls] = useState(
    (kind.imageUrls ?? []).join("\n")
  );
  const [imageUrl, setImageUrl] = useState(kind.imageUrl ?? "");
  const [imageUrlInput, setImageUrlInput] = useState(
    kind.imageUrl?.startsWith("https://") ? kind.imageUrl : ""
  );
  const [imagePreview, setImagePreview] = useState(kind.imageUrl ?? "");
  const [imageDirty, setImageDirty] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const showFees = kind.pricingMode === "loan_fee";
  const isFree = kind.pricingMode === "free";
  const showLoanHours = kind.reservationMode === "fixed_hours";

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError("");
    const preview = URL.createObjectURL(file);
    setImagePreview(preview);

    try {
      const compressed = await compressImageFile(file);
      const token = await getToken();
      const formData = new FormData();
      formData.append("gemachId", gemachId);
      formData.append("image", compressed, "tool.jpg");

      const res = await authFetch(
        `/api/admin/gemach/tools/${encodeURIComponent(kind.kindId)}/image`,
        { method: "POST", token, body: formData }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "העלאת התמונה נכשלה");

      setImageUrl(data.imageUrl ?? "");
      setImageUrlInput("");
      setImagePreview(data.imageUrl ?? "");
      setImageDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
      setImagePreview(imageUrl);
    } finally {
      URL.revokeObjectURL(preview);
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function applyImageUrl() {
    setError("");
    const err = validateToolImageUrl(imageUrlInput);
    if (err) {
      setError(err);
      return;
    }
    const trimmed = imageUrlInput.trim();
    if (trimmed) {
      setImageUrl(trimmed);
      setImagePreview(trimmed);
      setImageDirty(true);
    }
  }

  async function handleRemoveImage() {
    setUploadingImage(true);
    setError("");
    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append("gemachId", gemachId);
      formData.append("remove", "true");

      const res = await authFetch(
        `/api/admin/gemach/tools/${encodeURIComponent(kind.kindId)}/image`,
        { method: "POST", token, body: formData }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "הסרת התמונה נכשלה");

      setImageUrl("");
      setImageUrlInput("");
      setImagePreview("");
      setImageDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      let imageToSave: string | null | undefined;
      if (imageDirty) {
        imageToSave = resolveToolImageUrl(imageUrlInput || imageUrl);
      }

      const galleryUrls = extraImageUrls
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      for (const url of galleryUrls) {
        const err = validateToolImageUrl(url);
        if (err) throw new Error(err);
      }

      const resolvedCategory =
        category === "אחר" ? customCategory.trim() || "אחר" : category;

      const token = await getToken();
      const res = await authFetch(
        `/api/admin/gemach/tools/${encodeURIComponent(kind.kindId)}`,
        {
          method: "PATCH",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gemachId,
            name,
            description,
            category: resolvedCategory,
            loanFeeMin: Number(loanFeeMin),
            loanFeeMax: Number(loanFeeMax),
            defaultLoanHours: defaultLoanHours.trim() === "" ? null : Number(defaultLoanHours),
            maxLoanHours: maxLoanHours.trim() === "" ? null : Number(maxLoanHours),
            adminNotes: adminNotes.trim() || null,
            location: location.trim() || null,
            brand: brand.trim() || null,
            supplier: supplier.trim() || null,
            purpose: purpose.trim() || null,
            productAge: productAge.trim() === "" ? null : Number(productAge),
            imageUrls: galleryUrls.length ? galleryUrls : null,
            ...(imageToSave !== undefined ? { imageUrl: imageToSave } : {}),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-md">
      <CardBody className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          <fieldset className="space-y-3 rounded-xl border border-[var(--border)] p-4">
            <legend className="px-1 text-sm font-bold text-stone-900">🖼 תמונת הכלי</legend>
            {imagePreview ? (
              <div className="relative overflow-hidden rounded-xl border border-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt={name}
                  className="h-48 w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-warm-50 text-sm text-[var(--muted)]">
                אין תמונה — יוצג אייקון קטגוריה
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={uploadingImage}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingImage ? "מעלה…" : imagePreview ? "החלף מהמחשב" : "בחר מהמחשב"}
              </Button>
              {imagePreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploadingImage}
                  onClick={handleRemoveImage}
                >
                  הסר תמונה
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="hidden"
              onChange={handleImageFile}
            />
            <div>
              <label htmlFor="imageUrl" className="mb-1.5 block text-xs font-semibold text-stone-800">
                או קישור לתמונה (HTTPS)
              </label>
              <div className="flex gap-2">
                <input
                  id="imageUrl"
                  type="url"
                  dir="ltr"
                  value={imageUrlInput}
                  onChange={(e) => setImageUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
                <Button type="button" variant="secondary" size="sm" onClick={applyImageUrl}>
                  הצג
                </Button>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              העלאה מהמחשב נשמרת מיד · דורש הגדרת Cloudinary (חינם) · JPG/PNG/WebP
            </p>
          </fieldset>

          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-stone-800">
              שם הכלי *
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
            />
            {kind.totalUnits > 1 && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                השינוי יחול על כל {kind.totalUnits} היחידות.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-stone-800">
              תיאור (לשואלים) *
            </label>
            <textarea
              id="description"
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
                gemachDefaultLocation
                  ? `ריק = ${gemachDefaultLocation}`
                  : "לדוגמה: מחסן קרem, רח' …"
              }
              className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
            />
            {gemachDefaultLocation && !location.trim() && (
              <p className="mt-1 text-xs text-[var(--muted)]">
                ברירת מחדל מהגמ״ח: {gemachDefaultLocation}
              </p>
            )}
          </div>

          <fieldset className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/30 p-4">
            <legend className="px-1 text-sm font-bold text-stone-900">
              📋 פרטי עמוד הכלי (לשואלים)
            </legend>
            <p className="text-xs text-[var(--muted)]">
              השדות האלה מוצגים בעמוד הפרטים של הכלי בקטלוג.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="brand" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  מותג
                </label>
                <input
                  id="brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="לדוגמה: Bosch"
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
              <div>
                <label htmlFor="supplier" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  ספק
                </label>
                <input
                  id="supplier"
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="מי סיפק / תרם את הכלי"
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                />
              </div>
            </div>

            <div>
              <label htmlFor="purpose" className="mb-1.5 block text-sm font-semibold text-stone-800">
                ייעוד / שימוש מומלץ
              </label>
              <textarea
                id="purpose"
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="למשל: אירועים, עבודות גינה, שיפוץ…"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label htmlFor="productAge" className="mb-1.5 block text-sm font-semibold text-stone-800">
                גיל המוצר (שנים, משוער)
              </label>
              <input
                id="productAge"
                type="number"
                min={0}
                max={100}
                value={productAge}
                onChange={(e) => setProductAge(e.target.value)}
                placeholder="לדוגמה: 3"
                className="w-full max-w-[8rem] rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div>
              <label htmlFor="extraImageUrls" className="mb-1.5 block text-sm font-semibold text-stone-800">
                תמונות נוספות (קישור HTTPS, שורה לכל תמונה)
              </label>
              <textarea
                id="extraImageUrls"
                rows={3}
                dir="ltr"
                value={extraImageUrls}
                onChange={(e) => setExtraImageUrls(e.target.value)}
                placeholder={"https://...\nhttps://..."}
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 font-mono text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>
          </fieldset>

          <div>
            <label htmlFor="adminNotes" className="mb-1.5 block text-sm font-semibold text-stone-800">
              הערות מנהל (פנימי)
            </label>
            <textarea
              id="adminNotes"
              rows={2}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="הערות פנימיות — לא מוצגות לשואלים"
              className="w-full rounded-xl border border-[var(--border)] bg-amber-50/40 px-4 py-3 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <div>
            <label htmlFor="category" className="mb-1.5 block text-sm font-semibold text-stone-800">
              קטגוריה *
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
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

          {isFree && (
            <Alert variant="info">הגמ״ח במודל חינם — לא ייגבו דמי השאלה על כלי זה.</Alert>
          )}

          {kind.pricingMode === "maintenance_only" && (
            <Alert variant="info">
              מודל תחזוקה בלבד — דמי השאלה לפי הגדרת הגמ״ח, לא לפי כלי.
            </Alert>
          )}

          {showFees && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="loanFeeMin" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  דמי השאלה מינ׳ (₪)
                </label>
                <input
                  id="loanFeeMin"
                  type="number"
                  min={0}
                  value={loanFeeMin}
                  onChange={(e) => setLoanFeeMin(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor="loanFeeMax" className="mb-1.5 block text-sm font-semibold text-stone-800">
                  דמי השאלה מקס׳ (₪)
                </label>
                <input
                  id="loanFeeMax"
                  type="number"
                  min={0}
                  value={loanFeeMax}
                  onChange={(e) => setLoanFeeMax(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
                />
              </div>
            </div>
          )}

          {showLoanHours && (
            <fieldset className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
              <legend className="px-1 text-sm font-bold text-stone-900">⏱ משך השאלה</legend>
              <p className="text-xs text-[var(--muted)]">
                ברירת מחדל הגמ״ח: {kind.gemachDefaultLoanHours}–{kind.gemachMaxLoanHours} שעות
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="defaultLoanHours" className="mb-1.5 block text-sm font-semibold text-stone-800">
                    ברירת מחדל (שעות)
                  </label>
                  <input
                    id="defaultLoanHours"
                    type="number"
                    min={1}
                    max={MAX_LOAN_HOURS_CAP}
                    value={defaultLoanHours}
                    onChange={(e) => setDefaultLoanHours(e.target.value)}
                    placeholder={String(kind.gemachDefaultLoanHours)}
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="maxLoanHours" className="mb-1.5 block text-sm font-semibold text-stone-800">
                    מקסימום (שעות)
                  </label>
                  <input
                    id="maxLoanHours"
                    type="number"
                    min={1}
                    max={MAX_LOAN_HOURS_CAP}
                    value={maxLoanHours}
                    onChange={(e) => setMaxLoanHours(e.target.value)}
                    placeholder={String(kind.gemachMaxLoanHours)}
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                  />
                </div>
              </div>
            </fieldset>
          )}

          <p className="text-xs text-[var(--muted)]">
            {gemachPricingModeLabels[kind.pricingMode]}
          </p>

          <Button type="submit" size="lg" disabled={saving || uploadingImage} className="w-full">
            {saving ? "שומר…" : "שמור שינויים"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
