"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { PayboxPayoutPanel } from "@/components/admin/PayboxPayoutPanel";
import { formatNIS, splitPayment } from "@/lib/pots";
import type { Gemach, Tool } from "@/lib/types";
import type { DevicePot } from "@/lib/types";
import { useSelectedGemachId } from "@/hooks/useSelectedGemachId";

interface PotsData {
  tools: Tool[];
  devicePots: DevicePot[];
  operationsPot: { balance: number };
  operationsPercent: number;
  gemach: Gemach;
}

export default function GemachAdminPotsPage() {
  const { member, getIdToken } = useAuth();
  const { gemachId } = useSelectedGemachId();
  const [data, setData] = useState<PotsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gemachId) {
      setError("לא הוגדר גמ״ח לניהול");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const token = await getIdToken();
        const res = await authFetch(
          `/api/admin/gemach/pots?gemachId=${encodeURIComponent(gemachId!)}`,
          { token }
        );
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "טעינה נכשלה");
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [gemachId, getIdToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert variant="error">{error || "לא ניתן לטעון נתונים"}</Alert>;
  }

  const deviceBalances = Object.fromEntries(
    data.devicePots.map((p) => [p.toolId ?? (p as { id?: string }).id, p.balance])
  );

  return (
    <div>
      <PageHeader
        title={`קופות — ${data.gemach.name}`}
        description={`ניתוב כספים: ${data.operationsPercent}% לתפעול, ${100 - data.operationsPercent}% לכל מכשיר.`}
      />

      <PayboxPayoutPanel
        tools={data.tools}
        operationsBalance={data.operationsPot.balance}
        deviceBalances={deviceBalances}
        payboxEnabled={false}
      />

      <h2 className="mb-4 text-xl font-bold text-stone-900">קופות מכשירים</h2>
      {data.tools.length === 0 ? (
        <p className="text-[var(--muted)]">אין כלים בגמ״ח זה.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.tools.map((tool) => {
            const pot = data.devicePots.find(
              (p) => p.toolId === tool.id || (p as { id?: string }).id === tool.id
            );
            const balance = pot?.balance ?? 0;
            const split = splitPayment(tool.loanFeeMin, data.operationsPercent);
            return (
              <Card key={tool.id} className="transition hover:shadow-md">
                <CardBody>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {tool.category}
                  </p>
                  <h3 className="mt-1 font-bold text-stone-900">{tool.name}</h3>
                  <p className="mt-3 text-3xl font-bold text-kerem-700">{formatNIS(balance)}</p>
                  <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                    <p>
                      לכלי:{" "}
                      <span className="font-semibold text-stone-700">
                        {formatNIS(split.deviceAmount)}
                      </span>
                    </p>
                    <p>
                      לתפעול:{" "}
                      <span className="font-semibold text-stone-700">
                        {formatNIS(split.operationsAmount)}
                      </span>
                    </p>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
