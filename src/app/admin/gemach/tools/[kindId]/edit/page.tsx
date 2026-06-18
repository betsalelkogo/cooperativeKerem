"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { gemachPricingModeLabels } from "@/lib/gemach";
import { TOOL_CATEGORIES } from "@/lib/tools-admin";
import { BackLink, PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { AdminToolKindEdit } from "@/lib/types";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";

export default function EditGemachToolPage() {
  const router = useRouter();
  const params = useParams();
  const kindId = params.kindId as string;
  const { member, getIdToken } = useAuth();
  const { gemachId } = useSelectedGemachId();

  const [kind, setKind] = useState<AdminToolKindEdit | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(TOOL_CATEGORIES[0]);
  const [loanFeeMin, setLoanFeeMin] = useState("0");
  const [loanFeeMax, setLoanFeeMax] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gemachId || !kindId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch(
          `/api/admin/gemach/tools/${encodeURIComponent(kindId)}?gemachId=${encodeURIComponent(gemachId!)}`,
          { token }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "טעינה נכשלה");
        }
        const data = (await res.json()) as AdminToolKindEdit;
        setKind(data);
        setName(data.name);
        setDescription(data.description);
        setCategory(data.category);
        setLoanFeeMin(String(data.loanFeeMin));
        setLoanFeeMax(String(data.loanFeeMax));
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gemachId, kindId, getIdToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gemachId) return;
    setSaving(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch(
        `/api/admin/gemach/tools/${encodeURIComponent(kindId)}`,
        {
          method: "PATCH",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gemachId,
            name,
            description,
            category,
            loanFeeMin: Number(loanFeeMin),
            loanFeeMax: Number(loanFeeMax),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      router.push("/admin/gemach");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  if (!gemachId) {
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

  if (error && !kind) return <Alert variant="error">{error}</Alert>;
  if (!kind) return <Alert variant="error">הכלי לא נמצא</Alert>;

  const showFees = kind.pricingMode === "loan_fee";

  return (
    <div className="mx-auto max-w-lg">
      <BackLink href="/admin/gemach">חזרה ללוח הבקרה</BackLink>

      <PageHeader
        title="עריכת כלי"
        description={`${kind.totalUnits > 1 ? `${kind.totalUnits} יחידות · ` : ""}${gemachPricingModeLabels[kind.pricingMode]}`}
      />

      <Card className="shadow-md">
        <CardBody className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert variant="error">{error}</Alert>}

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
              <label
                htmlFor="description"
                className="mb-1.5 block text-sm font-semibold text-stone-800"
              >
                תיאור *
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
                {!TOOL_CATEGORIES.includes(category as (typeof TOOL_CATEGORIES)[number]) && (
                  <option value={category}>{category}</option>
                )}
              </select>
            </div>

            {showFees && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="loanFeeMin"
                    className="mb-1.5 block text-sm font-semibold text-stone-800"
                  >
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
                  <label
                    htmlFor="loanFeeMax"
                    className="mb-1.5 block text-sm font-semibold text-stone-800"
                  >
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

            <Button type="submit" size="lg" disabled={saving} className="w-full">
              {saving ? "שומר…" : "שמור שינויים"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
