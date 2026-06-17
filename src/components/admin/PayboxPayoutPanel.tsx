"use client";

import { useState } from "react";
import { formatNIS } from "@/lib/pots";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { PayboxPayout, Tool } from "@/lib/types";

interface PayboxPayoutPanelProps {
  tools: Tool[];
  operationsBalance: number;
  deviceBalances: Record<string, number>;
  payboxEnabled: boolean;
}

export function PayboxPayoutPanel({
  tools,
  operationsBalance,
  deviceBalances,
  payboxEnabled,
}: PayboxPayoutPanelProps) {
  const { getIdToken } = useAuth();
  const [potTarget, setPotTarget] = useState<"operations" | "device">("operations");
  const [toolId, setToolId] = useState(tools[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastPayout, setLastPayout] = useState<PayboxPayout | null>(null);
  const [confirming, setConfirming] = useState(false);

  const maxAmount =
    potTarget === "operations"
      ? operationsBalance
      : deviceBalances[toolId] ?? 0;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setLastPayout(null);

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/payouts/paybox", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          potTarget,
          toolId: potTarget === "device" ? toolId : undefined,
          amount: Number(amount),
          note: note || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "יצירת העברה נכשלה");
      }

      const payout = (await res.json()) as PayboxPayout;
      setLastPayout(payout);
      window.open(payout.groupUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!lastPayout) return;
    setConfirming(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch(`/api/payouts/paybox/${lastPayout.id}/confirm`, {
        method: "POST",
        token,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "אישור העברה נכשל");
      }

      setLastPayout(await res.json());
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setConfirming(false);
    }
  }

  if (!payboxEnabled) {
    return (
      <Alert variant="warning">
        PayBox לא מוגדר. הוסיפו{" "}
        <code className="rounded bg-amber-100 px-1 text-xs">PAYBOX_OPERATIONS_GROUP_URL</code>{" "}
        לקובץ <code className="rounded bg-amber-100 px-1 text-xs">.env</code>.
      </Alert>
    );
  }

  return (
    <Card className="mb-8 border-violet-200">
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">העברה לקבוצת PayBox</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            משכו כסף מקופה לקבוצת PayBox. ההעברה בפועל מתבצעת באפליקציית PayBox — אחרי
            שסיימתם, אשרו כאן כדי לעדכן את היתרה.
          </p>
        </div>

        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold">קופה</label>
            <select
              value={potTarget}
              onChange={(e) => setPotTarget(e.target.value as "operations" | "device")}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
            >
              <option value="operations">קופת תפעול ({formatNIS(operationsBalance)})</option>
              <option value="device">קופת מכשיר</option>
            </select>
          </div>

          {potTarget === "device" && (
            <div>
              <label className="mb-1 block text-sm font-semibold">כלי</label>
              <select
                value={toolId}
                onChange={(e) => setToolId(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
              >
                {tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({formatNIS(deviceBalances[t.id] ?? 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold">סכום (₪)</label>
            <input
              type="number"
              min={1}
              max={maxAmount}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">מקסימום: {formatNIS(maxAmount)}</p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-semibold">הערה (אופציונלי)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="למשל: תחזוקת מסור"
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={loading || maxAmount <= 0} className="w-full sm:w-auto">
              {loading ? "יוצר העברה…" : "פתיחת PayBox והעברה"}
            </Button>
          </div>
        </form>

        {lastPayout && lastPayout.status === "pending" && (
          <div className="rounded-xl bg-violet-50 p-4 ring-1 ring-violet-200">
            <p className="text-sm font-semibold text-violet-900">
              העברה ממתינה: {formatNIS(lastPayout.amount)}
            </p>
            <p className="mt-1 text-xs text-violet-700">
              לאחר שביצעתם את ההעברה ב-PayBox, לחצו לאישור.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={lastPayout.groupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white"
              >
                פתיחת קבוצת PayBox
              </a>
              <Button type="button" onClick={handleConfirm} disabled={confirming} size="sm">
                {confirming ? "מאשר…" : "אישרתי — עדכון יתרה"}
              </Button>
            </div>
          </div>
        )}

        {lastPayout && lastPayout.status === "completed" && (
          <Alert variant="success">ההעברה אושרה והיתרה עודכנה.</Alert>
        )}

        {error && <Alert variant="error">{error}</Alert>}
      </CardBody>
    </Card>
  );
}
