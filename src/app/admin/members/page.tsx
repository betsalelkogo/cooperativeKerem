"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { loanStatusLabels, reservationStatusLabels } from "@/lib/labels";
import { formatDateHe } from "@/lib/dates";
import { LoanPhotoThumb } from "@/components/admin/LoanPhotoThumb";
import type { AdminMemberHistory, AdminMemberSummary, MemberRole } from "@/lib/types";

const roleLabels: Record<MemberRole, string> = {
  ADMIN: "מנהל פלטפורמה",
  GEMACH_ADMIN: "מנהל גמ״ח",
  MEMBER: "חבר",
};

export default function AdminMembersPage() {
  const { getIdToken } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AdminMemberSummary[]>([]);
  const [selected, setSelected] = useState<AdminMemberHistory | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [roleUpdating, setRoleUpdating] = useState(false);

  useEffect(() => {
    async function loadMembers() {
      setLoading(true);
      setError("");
      try {
        const token = await getIdToken();
        const res = await authFetch("/api/admin/members", { token });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "טעינה נכשלה");
        setMembers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה");
        setMembers([]);
      } finally {
        setLoading(false);
      }
    }
    loadMembers();
  }, [getIdToken]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter(
      (m) =>
        m.email.toLowerCase().includes(normalized) ||
        m.name.toLowerCase().includes(normalized)
    );
  }, [members, query]);

  async function loadMember(id: string) {
    setLoadingDetail(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch(`/api/admin/members/${encodeURIComponent(id)}`, { token });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "טעינה נכשלה");
      setSelected(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function updateRole(memberId: string, role: MemberRole) {
    setRoleUpdating(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch(`/api/admin/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "עדכון נכשל");
      setSelected((prev) =>
        prev ? { ...prev, member: data.member } : prev
      );
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: data.member.role } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setRoleUpdating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="ניהול חברים"
        description="כל החברים במערכת — חיפוש לפי שם או אימייל, צפייה בהיסטוריה ומתן הרשאות מנהל."
      />

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      <Card className="mb-8">
        <CardBody className="py-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="סינון לפי שם או אימייל..."
            className="min-h-[44px] w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm"
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-bold text-stone-900">
            חברים ({loading ? "…" : filtered.length}
            {query.trim() && members.length !== filtered.length
              ? ` מתוך ${members.length}`
              : ""}
            )
          </h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardBody className="py-8 text-center text-[var(--muted)]">
                {members.length === 0 ? "אין חברים במערכת" : "לא נמצאו תוצאות לסינון"}
              </CardBody>
            </Card>
          ) : (
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {filtered.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => loadMember(member.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-right transition ${
                    selected?.member.id === member.id
                      ? "border-kerem-300 bg-kerem-50"
                      : "border-[var(--border)] bg-white hover:bg-warm-50"
                  }`}
                >
                  <p className="font-semibold text-stone-900">{member.name}</p>
                  <p className="text-sm text-[var(--muted)]">{member.email}</p>
                  <p className="mt-1 text-xs font-medium text-kerem-800">
                    {roleLabels[member.role]}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold text-stone-900">פרטי חבר</h2>
          {loadingDetail ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
            </div>
          ) : !selected ? (
            <Card>
              <CardBody className="py-8 text-center text-[var(--muted)]">
                בחרו חבר מהרשימה לצפייה בהיסטוריה
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardBody className="py-4">
                  <p className="text-xl font-bold text-stone-900">{selected.member.name}</p>
                  <p className="text-sm text-[var(--muted)]">{selected.member.email}</p>
                  <p className="mt-2 text-sm">
                    תפקיד: <strong>{roleLabels[selected.member.role]}</strong>
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.member.role !== "ADMIN" && (
                      <button
                        type="button"
                        disabled={roleUpdating}
                        onClick={() => updateRole(selected.member.id, "ADMIN")}
                        className="rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-200 disabled:opacity-50"
                      >
                        הפוך למנהל פלטפורמה
                      </button>
                    )}
                    {selected.member.role === "ADMIN" && (
                      <button
                        type="button"
                        disabled={roleUpdating}
                        onClick={() => updateRole(selected.member.id, "MEMBER")}
                        className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 disabled:opacity-50"
                      >
                        הסר הרשאות מנהל
                      </button>
                    )}
                  </div>
                </CardBody>
              </Card>

              <div>
                <h3 className="mb-2 font-bold text-stone-900">
                  השאלות ({selected.loans.length})
                </h3>
                {selected.loans.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">אין השאלות</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {selected.loans.map((loan) => (
                      <div
                        key={loan.id}
                        className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{loan.toolName}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {loanStatusLabels[loan.status]}
                          {loan.checkedOutAt &&
                            ` · לקיחה: ${formatDateHe(loan.checkedOutAt, true)}`}
                          {loan.returnedAt &&
                            ` · החזרה: ${formatDateHe(loan.returnedAt, true)}`}
                          {(loan.additionalPhotoCount ?? 0) > 0 &&
                            ` · ${loan.additionalPhotoCount} צילומים נוספים`}
                        </p>
                        {(loan.checkoutPhotoUrl || loan.returnPhotoUrl) && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {loan.checkoutPhotoUrl && (
                              <LoanPhotoThumb url={loan.checkoutPhotoUrl} label="לקיחה" />
                            )}
                            {loan.returnPhotoUrl && (
                              <LoanPhotoThumb url={loan.returnPhotoUrl} label="החזרה" />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-2 font-bold text-stone-900">
                  שמירות ({selected.reservations.length})
                </h3>
                {selected.reservations.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">אין שמירות</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {selected.reservations.map((reservation) => (
                      <div
                        key={reservation.id}
                        className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{reservation.toolName}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {reservationStatusLabels[reservation.status]}
                          {` · ${formatDateHe(reservation.pickupDate)} — ${formatDateHe(reservation.returnDate)}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
