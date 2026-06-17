"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { gemachPricingModeLabels } from "@/lib/gemach";
import { TOOL_CATEGORIES } from "@/lib/tools-admin";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Gemach } from "@/lib/types";

export default function AddGemachToolPage() {
  const router = useRouter();
  const { member, getIdToken } = useAuth();
  const gemachId = member?.gemachAdminIds?.[0];
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
  const [quantity, setQuantity] = useState("1");
  const [loanFeeMin, setLoanFeeMin] = useState("20");
  const [loanFeeMax, setLoanFeeMax] = useState("50");
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
        setGemach(data.gemach ?? null);
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
      const res = await authFetch("/api/admin/gemach/tools", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gemachId,
          name,
          description,
          category,
          quantity: Number(quantity),
          loanFeeMin: Number(loanFeeMin),
          loanFeeMax: Number(loanFeeMax),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "הוספת הכלי נכשלה");
      }

      router.push(`/admin/gemach?toolsAdded=${data.tools.length}`);
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

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin/gemach">חזרה ללוח הבקרה</BackLink>

      <PageHeader
        title="הוספת כלי לגמ״ח"
        description={
          gemach
            ? `${gemach.name} · ${gemachPricingModeLabels[gemach.pricingMode]}`
            : "טוען…"
        }
      />

      {justCreated && (
        <Alert variant="success" className="mb-6">
          <p className="font-semibold">הגemach נוצר! עכשיו הוסיפו את הכלים הראשונים.</p>
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
            </div>

            <div>
              <label htmlFor="quantity" className="mb-1.5 block text-sm font-semibold text-stone-800">
                כמה יחידות מאותו סוג? *
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                max={50}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                יופיעו ברשימה ככלי אחד עם מספר יחידות (למשל 3 מסורים זהים).
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

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? "מוסיף…" : "הוסף לרשימת הכלים"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
