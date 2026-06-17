"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { formatNIS } from "@/lib/pots";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { BackLink } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { Tool } from "@/lib/types";

export default function ReserveToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();
  const [tool, setTool] = useState<Tool | null>(null);
  const [loadError, setLoadError] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/tools/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("הכלי לא נמצא");
        return res.json();
      })
      .then(setTool)
      .catch((err) => setLoadError(err.message));
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tool) return;
    setLoading(true);
    setError("");

    try {
      const token = await getIdToken();
      const res = await authFetch("/api/reservations", {
        method: "POST",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, date }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "השריון נכשל");
      }

      const reservation = await res.json();
      router.push(`/checkout/${reservation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "משהו השתבש");
    } finally {
      setLoading(false);
    }
  }

  if (loadError) return <Alert variant="error">{loadError}</Alert>;
  if (!tool) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="mx-auto max-w-md">
      <BackLink href={`/tools/${tool.id}`}>חזרה ל{tool.name}</BackLink>

      <Card className="shadow-md">
        <div className="h-1.5 bg-gradient-to-l from-kerem-500 to-kerem-700" />
        <CardBody className="py-6">
          <h1 className="text-2xl font-bold text-stone-900">שריון {tool.name}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            בחרו תאריך איסוף מהקרוואן הקהילתי.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="date" className="mb-2 block text-sm font-semibold text-stone-800">
                📅 תאריך איסוף
              </label>
              <input
                id="date"
                type="date"
                min={today}
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-warm-50/50 px-4 py-3 text-sm transition focus:border-kerem-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-kerem-200"
              />
            </div>

            <div className="rounded-xl bg-kerem-50 p-4 ring-1 ring-kerem-200">
              <p className="text-xs font-semibold text-kerem-700">דמי השאלה המשוערים</p>
              <p className="mt-1 text-xl font-bold text-kerem-800">
                {formatNIS(tool.loanFeeMin)}–{formatNIS(tool.loanFeeMax)}
              </p>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" disabled={loading || !date} className="w-full" size="lg">
              {loading ? "שומר…" : "אישור שריון"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
