"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { DisputeDetailPanel } from "@/components/admin/DisputeDetailPanel";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { DISPUTE_STATUS_LABELS, isDisputeOpen } from "@/lib/disputes";
import type {
  AdminDisputeDetail,
  AdminDisputeSummary,
  AdminMemberSummary,
} from "@/lib/types";

type FilterMode = "all" | "open" | "resolved";

function DisputesPageContent() {
  const { getIdToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");

  const [disputes, setDisputes] = useState<AdminDisputeSummary[]>([]);
  const [members, setMembers] = useState<AdminMemberSummary[]>([]);
  const [detail, setDetail] = useState<AdminDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/disputes", { token });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "טעינה נכשלה");
      setDisputes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const loadMembers = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await authFetch("/api/admin/members", { token });
      const data = await res.json();
      if (res.ok) setMembers(data);
    } catch {
      // mediator assignment is admin-only; ignore for board/resolvers
    }
  }, [getIdToken]);

  const loadDetail = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      setError("");
      try {
        const token = await getIdToken();
        const res = await authFetch(`/api/admin/disputes/${encodeURIComponent(id)}`, {
          token,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "טעינה נכשלה");
        setDetail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [getIdToken]
  );

  useEffect(() => {
    loadDisputes();
    loadMembers();
  }, [loadDisputes, loadMembers]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return disputes.filter((d) => {
      if (filter === "open" && !d.isOpen) return false;
      if (filter === "resolved" && d.isOpen) return false;
      if (!normalized) return true;
      return (
        d.toolName.toLowerCase().includes(normalized) ||
        d.memberName.toLowerCase().includes(normalized)
      );
    });
  }, [disputes, filter, query]);

  function selectDispute(id: string) {
    router.push(`/admin/disputes?id=${encodeURIComponent(id)}`);
  }

  function handleDetailUpdated(updated: AdminDisputeDetail) {
    setDetail(updated);
    setDisputes((prev) =>
      prev.map((d) =>
        d.id === updated.id
          ? {
              ...d,
              status: updated.status,
              progressLabel: updated.progressLabel,
              isOpen: isDisputeOpen(updated.status),
            }
          : d
      )
    );
    loadDisputes();
  }

  return (
    <div>
      <PageHeader
        title="מחלוקות"
        description="צפייה במחלוקות, שיבוץ מיישבים והכרעה."
      />

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["all", "הכל"],
            ["open", "פתוחות"],
            ["resolved", "סגורות"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              filter === value
                ? "bg-kerem-700 text-white"
                : "bg-warm-100 text-stone-700 hover:bg-warm-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <Card className="mb-4">
            <CardBody className="py-4">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי כלי או חבר…"
                className="min-h-[44px] w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
              />
            </CardBody>
          </Card>

          <h2 className="mb-3 text-lg font-bold text-stone-900">
            רשימה ({loading ? "…" : filtered.length})
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardBody className="py-8 text-center text-[var(--muted)]">
                אין מחלוקות
              </CardBody>
            </Card>
          ) : (
            <div className="max-h-[36rem] space-y-2 overflow-y-auto">
              {filtered.map((dispute) => (
                <button
                  key={dispute.id}
                  type="button"
                  onClick={() => selectDispute(dispute.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-right transition ${
                    selectedId === dispute.id
                      ? "border-kerem-300 bg-kerem-50"
                      : "border-[var(--border)] bg-white hover:bg-warm-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-stone-900">{dispute.toolName}</p>
                      <p className="text-sm text-[var(--muted)]">{dispute.memberName}</p>
                      <p className="mt-1 text-xs text-stone-600">{dispute.progressLabel}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-kerem-800">
                      {DISPUTE_STATUS_LABELS[dispute.status]}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-stone-900">פרטי מחלוקת</h2>
          {loadingDetail ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
            </div>
          ) : !detail ? (
            <Card>
              <CardBody className="py-8 text-center text-[var(--muted)]">
                {selectedId ? "לא נמצאה מחלוקת" : "בחרו מחלוקת מהרשימה"}
              </CardBody>
            </Card>
          ) : (
            <DisputeDetailPanel
              detail={detail}
              members={members}
              getToken={getIdToken}
              onUpdated={handleDetailUpdated}
            />
          )}
        </section>
      </div>
    </div>
  );
}

export default function AdminDisputesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
        </div>
      }
    >
      <DisputesPageContent />
    </Suspense>
  );
}
