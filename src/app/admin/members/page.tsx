"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { loanStatusLabels, reservationStatusLabels } from "@/lib/labels";
import { formatDateHe } from "@/lib/dates";
import { formatCredits } from "@/lib/pots";
import { LoanPhotoThumb } from "@/components/admin/LoanPhotoThumb";
import type {
  AdminMemberHistory,
  AdminMemberSummary,
  CreditLedgerReason,
  MemberRole,
} from "@/lib/types";

type ImportResult = {
  summary: {
    appliedCount: number;
    totalApplied: number;
    totalMembershipFee: number;
    duplicateCount: number;
    unmatchedCount: number;
    notMemberCount: number;
    skippedNonPayment: number;
    errorCount: number;
  };
  applied: Array<{
    name: string;
    identifier: string;
    amount: number;
    membershipFee: number;
    gross: number;
    balance: number;
    date: string;
    matchedBy: "phone" | "email";
    becameMember: boolean;
  }>;
  duplicates: Array<{ identifier: string; amount: number; date: string }>;
  unmatched: Array<{ row: number; identifier: string; amount: number }>;
  notMember: Array<{ row: number; name: string; identifier: string; amount: number }>;
  errors: Array<{ row: number; message: string }>;
};

const roleLabels: Record<MemberRole, string> = {
  ADMIN: "מנהל פלטפורמה",
  GEMACH_ADMIN: "מנהל גמ״ח",
  BOARD: "דירקטוריון",
  DISPUTE_RESOLVER: "מיישב מחלוקות",
  MEMBER: "חבר",
};

const creditReasonLabels: Record<CreditLedgerReason, string> = {
  manual_adjustment: "עדכון ידני",
  tool_sale: "מכירת כלי לקואופרטיב",
  refund: "החזר",
  paybox_import: "טעינת תשלומי PayBox",
  payment_debit: "תשלום מהיתרה",
  peer_transfer_out: "העברת קרדיט לחבר",
  peer_transfer_in: "קבלת קרדיט מחבר",
  peer_repay_out: "החזר חוב לחבר",
  peer_repay_in: "קבלת החזר חוב מחבר",
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
  const [flagUpdating, setFlagUpdating] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditSign, setCreditSign] = useState<"add" | "subtract">("add");
  const [creditReason, setCreditReason] = useState<CreditLedgerReason>("manual_adjustment");
  const [creditNote, setCreditNote] = useState("");
  const [creditUpdating, setCreditUpdating] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadMembers = useCallback(async () => {
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
  }, [getIdToken]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function importPayments() {
    if (!importFile) {
      setError("יש לבחור קובץ Excel להעלאה");
      return;
    }
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await authFetch("/api/admin/members/import-payments", {
        method: "POST",
        token,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "העלאת הקובץ נכשלה");
      setImportResult(data as ImportResult);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setImporting(false);
    }
  }

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

  async function adjustCredit(memberId: string) {
    const magnitude = Number(creditAmount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setError("יש להזין סכום חיובי");
      return;
    }
    const delta = creditSign === "subtract" ? -magnitude : magnitude;

    setCreditUpdating(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch(
        `/api/admin/members/${encodeURIComponent(memberId)}/credit`,
        {
          method: "POST",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta, note: creditNote, reason: creditReason }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "עדכון היתרה נכשל");

      setSelected((prev) =>
        prev
          ? {
              ...prev,
              member: { ...prev.member, creditBalance: data.creditBalance },
              creditLedger: data.ledger ?? prev.creditLedger,
            }
          : prev
      );
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId ? { ...m, creditBalance: data.creditBalance } : m
        )
      );
      setCreditAmount("");
      setCreditNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setCreditUpdating(false);
    }
  }

  async function updateFlags(
    memberId: string,
    updates: { isAmember?: boolean; firstPayout?: boolean }
  ) {
    setFlagUpdating(true);
    setError("");
    try {
      const token = await getIdToken();
      const res = await authFetch(`/api/admin/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "עדכון נכשל");
      setSelected((prev) => (prev ? { ...prev, member: data.member } : prev));
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, isAmember: data.member.isAmember, firstPayout: data.member.firstPayout }
            : m
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setFlagUpdating(false);
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

      <Card className="mb-6 border-kerem-200">
        <CardBody className="py-4">
          <h2 className="font-bold text-stone-900">טעינת תשלומי PayBox</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            העלו את קובץ ה-Excel שמייצא PayBox. הסכום מעמודת <strong>סכום</strong> יתווסף
            ליתרת החבר לפי <strong>מספר הטלפון</strong> (עמודת פלאפון), ואם לא נמצא — לפי
            אימייל שהוזן בעמודת <strong>הערות</strong>. מי שאינו חבר יזוכה רק בתשלום הצטרפות
            של ₪200 ומעלה (מנוכים ₪150 דמי חבר), ואז יסומן כחבר. טעינה חוזרת של אותו קובץ
            לא תזכה פעמיים. פעולה זו זמינה למנהל פלטפורמה בלבד.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportResult(null);
              }}
              className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-kerem-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-kerem-800 hover:file:bg-kerem-200"
            />
            <button
              type="button"
              disabled={importing || !importFile}
              onClick={importPayments}
              className="rounded-lg bg-kerem-700 px-4 py-2 text-sm font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
            >
              {importing ? "טוען…" : "טען תשלומים"}
            </button>
          </div>

          {importResult && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">
                  זוכו: {importResult.summary.appliedCount} · סה״כ{" "}
                  {formatCredits(importResult.summary.totalApplied)}
                </span>
                {importResult.summary.totalMembershipFee > 0 && (
                  <span className="rounded-lg bg-kerem-100 px-3 py-1 font-semibold text-kerem-800">
                    דמי חבר שנגבו: {formatCredits(importResult.summary.totalMembershipFee)}
                  </span>
                )}
                {importResult.summary.duplicateCount > 0 && (
                  <span className="rounded-lg bg-stone-100 px-3 py-1 font-semibold text-stone-700">
                    כפולים (דולגו): {importResult.summary.duplicateCount}
                  </span>
                )}
                {importResult.summary.unmatchedCount > 0 && (
                  <span className="rounded-lg bg-amber-100 px-3 py-1 font-semibold text-amber-800">
                    לא נמצא חבר תואם: {importResult.summary.unmatchedCount}
                  </span>
                )}
                {importResult.summary.notMemberCount > 0 && (
                  <span className="rounded-lg bg-amber-100 px-3 py-1 font-semibold text-amber-800">
                    לא חבר — לא זוכה: {importResult.summary.notMemberCount}
                  </span>
                )}
                {importResult.summary.skippedNonPayment > 0 && (
                  <span className="rounded-lg bg-stone-100 px-3 py-1 font-semibold text-stone-700">
                    לא תשלום (דולגו): {importResult.summary.skippedNonPayment}
                  </span>
                )}
                {importResult.summary.errorCount > 0 && (
                  <span className="rounded-lg bg-red-100 px-3 py-1 font-semibold text-red-800">
                    שגיאות: {importResult.summary.errorCount}
                  </span>
                )}
              </div>

              {importResult.applied.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-emerald-800">זוכו בהצלחה</p>
                  <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                    {importResult.applied.map((a, idx) => (
                      <li key={`a-${idx}`}>
                        {a.name} ({a.identifier}) — {formatCredits(a.amount)}
                        {a.membershipFee > 0
                          ? ` (מתוך ${formatCredits(a.gross)}, דמי חבר ${formatCredits(
                              a.membershipFee
                            )})`
                          : ""}
                        {a.date ? ` · ${a.date}` : ""}
                        {` · ${a.matchedBy === "phone" ? "לפי טלפון" : "לפי אימייל"}`}
                        {a.becameMember ? " · הצטרף כחבר" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.duplicates.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-stone-700">
                    כבר זוכו בעבר — דולגו כדי לא לזכות פעמיים
                  </p>
                  <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                    {importResult.duplicates.map((d, idx) => (
                      <li key={`d-${idx}`}>
                        {d.identifier} — {formatCredits(d.amount)}
                        {d.date ? ` · ${d.date}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.notMember.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-amber-800">
                    לא חבר — לא זוכה (תשלום נמוך מ-₪200; רק תשלום הצטרפות מזכה)
                  </p>
                  <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                    {importResult.notMember.map((n) => (
                      <li key={`n-${n.row}`}>
                        שורה {n.row}: {n.name} ({n.identifier}) — {formatCredits(n.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.unmatched.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-amber-800">
                    לא נמצא חבר תואם (הטלפון/האימייל לא במערכת — החבר עדיין לא נרשם?)
                  </p>
                  <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                    {importResult.unmatched.map((u) => (
                      <li key={`u-${u.row}`}>
                        שורה {u.row}: {u.identifier} — {formatCredits(u.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-bold text-red-800">שגיאות</p>
                  <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                    {importResult.errors.map((e) => (
                      <li key={`e-${e.row}`}>
                        שורה {e.row}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

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
                  {(selected.member.firstName || selected.member.familyName) && (
                    <p className="text-sm text-[var(--muted)]">
                      {[selected.member.firstName, selected.member.familyName]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  )}
                  <p className="text-sm text-[var(--muted)]">{selected.member.email}</p>
                  {selected.member.phone && (
                    <p className="text-sm text-[var(--muted)]" dir="ltr">
                      {selected.member.phone}
                    </p>
                  )}
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

                  <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        חבר בקואופרטיב:{" "}
                        <strong>{selected.member.isAmember ? "כן" : "לא"}</strong>
                      </span>
                      <button
                        type="button"
                        disabled={flagUpdating}
                        onClick={() =>
                          updateFlags(selected.member.id, {
                            isAmember: !selected.member.isAmember,
                          })
                        }
                        className="rounded-lg bg-kerem-100 px-3 py-1.5 text-xs font-semibold text-kerem-800 hover:bg-kerem-200 disabled:opacity-50"
                      >
                        {selected.member.isAmember ? "סמן כלא-חבר" : "סמן כחבר"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        דמי חבר (₪150):{" "}
                        <strong>
                          {selected.member.firstPayout ? "טרם נגבו" : "נגבו"}
                        </strong>
                      </span>
                      <button
                        type="button"
                        disabled={flagUpdating}
                        onClick={() =>
                          updateFlags(selected.member.id, {
                            firstPayout: !selected.member.firstPayout,
                          })
                        }
                        className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200 disabled:opacity-50"
                      >
                        {selected.member.firstPayout
                          ? "סמן כנגבו"
                          : "אפס לגבייה מחדש"}
                      </button>
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      בתשלום הראשון של חבר מנוכים דמי החבר (₪150) והיתרה נזקפת ליתרתו.
                    </p>
                  </div>
                </CardBody>
              </Card>

              <Card className="border-kerem-200">
                <CardBody className="py-4">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-bold text-stone-900">יתרה</h3>
                    <span className="text-2xl font-extrabold text-kerem-800">
                      {formatCredits(selected.member.creditBalance)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    יתרה לשימוש בתשלום דמי השאלה. ניתן לעדכון על ידי מנהל פלטפורמה בלבד
                    (למשל הוספת קרדיט עבור מכירת כלי לקואופרטיב).
                  </p>
                  {!selected.member.isAmember && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                      חבר זה אינו רשום כחבר משלם — לא ניתן להוסיף לו יתרה. יש לסמן אותו כחבר
                      תחילה.
                    </p>
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-[auto,1fr]">
                    <div className="flex gap-2">
                      <select
                        value={creditSign}
                        onChange={(e) =>
                          setCreditSign(e.target.value as "add" | "subtract")
                        }
                        className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                      >
                        <option value="add">הוספה +</option>
                        <option value="subtract">הפחתה −</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        placeholder="סכום שֶׁכֵּלִים"
                        className="w-28 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </div>
                    <select
                      value={creditReason}
                      onChange={(e) =>
                        setCreditReason(e.target.value as CreditLedgerReason)
                      }
                      className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="manual_adjustment">עדכון ידני</option>
                      <option value="tool_sale">מכירת כלי לקואופרטיב</option>
                      <option value="refund">החזר</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={creditNote}
                    onChange={(e) => setCreditNote(e.target.value)}
                    placeholder="הערה (למשל: הערת שווי מקדחה ₪300)"
                    className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={creditUpdating}
                    onClick={() => adjustCredit(selected.member.id)}
                    className="mt-3 rounded-lg bg-kerem-700 px-4 py-2 text-sm font-semibold text-white hover:bg-kerem-800 disabled:opacity-50"
                  >
                    {creditUpdating ? "מעדכן…" : "עדכון יתרה"}
                  </button>

                  {selected.creditLedger.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-1 text-xs font-bold text-stone-700">
                        תנועות אחרונות
                      </h4>
                      <div className="max-h-48 space-y-1 overflow-y-auto">
                        {selected.creditLedger.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
                          >
                            <div>
                              <span className="font-medium text-stone-800">
                                {creditReasonLabels[entry.reason]}
                              </span>
                              {entry.note && (
                                <span className="text-[var(--muted)]"> · {entry.note}</span>
                              )}
                              <span className="block text-[var(--muted)]">
                                {formatDateHe(entry.createdAt, true)} · יתרה:{" "}
                                {formatCredits(entry.balanceAfter)}
                              </span>
                            </div>
                            <span
                              className={
                                entry.delta >= 0
                                  ? "font-bold text-emerald-700"
                                  : "font-bold text-red-700"
                              }
                            >
                              {entry.delta >= 0 ? "+" : "−"}
                              {formatCredits(Math.abs(entry.delta))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                  שריונים ({selected.reservations.length})
                </h3>
                {selected.reservations.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">אין שריונים</p>
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
