"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { gemachPricingModeLabels } from "@/lib/gemach";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { GemachPricingMode } from "@/lib/types";

const pricingOptions: { value: GemachPricingMode; hint: string }[] = [
  { value: "free", hint: "השאלה ללא תשלום — מתאים לגמ״חים קהילתיים" },
  { value: "loan_fee", hint: "דמי השאלה לפי כל כלי (כמו בכרם)" },
  { value: "maintenance_only", hint: "סכום קבוע לתחזוקה בלבד" },
];

export default function AddGemachPage() {
  const router = useRouter();
  const { getIdToken, refreshMember } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [pricingMode, setPricingMode] = useState<GemachPricingMode>("free");
  const [maintenanceFee, setMaintenanceFee] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/gemachim", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          slug: slug || undefined,
          pricingMode,
          maintenanceFee:
            pricingMode === "maintenance_only" ? Number(maintenanceFee || 0) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "יצירת הגמ״ח נכשלה");
      }

      await refreshMember();
      router.push("/admin/gemach/tools/new?created=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/tools">חזרה לכלים</BackLink>

      <PageHeader
        title="הוסיפו את הגמ״ח שלכם"
        description="פתחו גמ״ח שותף בפלטפורמת כרם — הכלים שלכם יופיעו ברשימת הכלים המשותפת עם תג ★."
      />

      <Card className="shadow-md">
        <div className="h-1.5 bg-gradient-to-l from-amber-400 to-orange-500" />
        <CardBody className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}

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
                placeholder='לדוגמה: גמ״ח תינוקות שכונתי'
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
              <label htmlFor="slug" className="mb-1.5 block text-sm font-semibold text-stone-800">
                מזהה (אופציונלי)
              </label>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="baby-neighborhood"
                dir="ltr"
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                אותיות קטנות באנגלית, מספרים ומקף. אם ריק — יווצר אוטומטית.
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

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "יוצר גמ״ח…" : "צור גמ״ח והתחל לנהל"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        כבר יש לכם גמ״ח?{" "}
        <Link href="/admin/gemach" className="font-semibold text-kerem-700 hover:underline">
          ללוח הבקרה
        </Link>
      </p>
    </div>
  );
}
