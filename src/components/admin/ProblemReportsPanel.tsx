"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";
import { formatDateHe } from "@/lib/dates";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { AdminMaintenanceReport } from "@/lib/types";

interface ProblemReportsPanelProps {
  reports: AdminMaintenanceReport[];
  showGemachColumn?: boolean;
  getToken: () => Promise<string | null>;
  onUpdated?: () => void;
}

function formatDateTime(iso?: string) {
  return formatDateHe(iso, true);
}

export function ProblemReportsPanel({
  reports,
  showGemachColumn = false,
  getToken,
  onUpdated,
}: ProblemReportsPanelProps) {
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (reports.length === 0) return null;

  async function resolveReport(reportId: string) {
    setLoadingId(reportId);
    setError("");
    try {
      const token = await getToken();
      const res = await authFetch(`/api/admin/maintenance/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminReply: replyById[reportId] ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "סגירה נכשלה");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-bold text-stone-900">⚠️ דיווחים על בעיות</h2>
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.id} className="border-orange-300 bg-orange-50/50">
            <CardBody className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-stone-900">{report.toolName}</p>
                  {showGemachColumn && report.gemachName && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{report.gemachName}</p>
                  )}
                  <p className="mt-2 text-sm text-stone-700">{report.memberName}</p>
                  <p className="text-xs text-[var(--muted)]">{report.memberEmail}</p>
                </div>
                <span className="shrink-0 rounded-full bg-orange-200 px-2.5 py-1 text-xs font-bold text-orange-900 ring-1 ring-inset ring-orange-300">
                  פתוח
                </span>
              </div>
              <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-stone-800">
                {report.description}
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                דווח: {formatDateTime(report.createdAt)}
              </p>
              <div className="mt-4 space-y-2">
                <label
                  htmlFor={`reply-${report.id}`}
                  className="block text-xs font-semibold text-stone-800"
                >
                  תגובת מנהל / סיכום טיפול
                </label>
                <textarea
                  id={`reply-${report.id}`}
                  rows={2}
                  value={replyById[report.id] ?? ""}
                  onChange={(e) =>
                    setReplyById((prev) => ({ ...prev, [report.id]: e.target.value }))
                  }
                  placeholder="לדוגמה: נבדק — הכלי תוקן וחזר לשימוש"
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={loadingId === report.id}
                  onClick={() => resolveReport(report.id)}
                  className="w-full"
                >
                  {loadingId === report.id ? "סוגר…" : "סגור טיפול — סומן כטופל"}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </section>
  );
}
