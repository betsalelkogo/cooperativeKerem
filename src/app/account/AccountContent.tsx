"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/api-client";
import { JoinMembershipBanner } from "@/components/membership/JoinMembershipBanner";
import { isPaidMember } from "@/lib/membership";
import { formatCredits } from "@/lib/pots";
import type { CreditLedgerEntry, PeerDebtSummary } from "@/lib/types";

type StatementEntry = CreditLedgerEntry & { toolName?: string };
type DirectoryMember = { id: string; name: string };

function describeEntry(entry: StatementEntry): string {
  switch (entry.reason) {
    case "payment_debit":
      return entry.toolName ? `תשלום עבור ${entry.toolName}` : "תשלום עבור השאלה";
    case "tool_sale":
      return "זיכוי עבור מכירת כלי";
    case "refund":
      return "החזר קרדיט";
    case "paybox_import":
      return "טעינת תשלום PayBox";
    // Peer entries store the counterparty family name in the note; prefer it.
    case "peer_transfer_out":
      return entry.note || "העברת קרדיט לחבר";
    case "peer_transfer_in":
      return entry.note || "קבלת קרדיט מחבר";
    case "peer_repay_out":
      return entry.note || "החזר חוב לחבר";
    case "peer_repay_in":
      return entry.note || "קבלת החזר חוב מחבר";
    case "manual_adjustment":
    default:
      return entry.delta >= 0 ? "טעינת קרדיט ליתרה" : "עדכון יתרה";
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AccountContent() {
  const { user, member, getIdToken, refreshMember } = useAuth();

  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<StatementEntry[]>([]);
  const [owed, setOwed] = useState<PeerDebtSummary[]>([]);
  const [lent, setLent] = useState<PeerDebtSummary[]>([]);
  const [members, setMembers] = useState<DirectoryMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [toMemberId, setToMemberId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberListOpen, setMemberListOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    const list = q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
    return list.slice(0, 8);
  }, [members, memberQuery]);

  const load = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;

    const [stmtRes, peerRes] = await Promise.all([
      authFetch("/api/account/statement", { token }),
      authFetch("/api/account/peer", { token }),
    ]);

    if (!stmtRes.ok) {
      const data = await stmtRes.json();
      throw new Error(data.error ?? "שגיאה בטעינת העו״ש");
    }
    const stmt = await stmtRes.json();
    setBalance(stmt.balance ?? 0);
    setEntries(stmt.entries ?? []);

    if (peerRes.ok) {
      const peer = await peerRes.json();
      setOwed(peer.owed ?? []);
      setLent(peer.lent ?? []);
      setMembers(peer.members ?? []);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, load]);

  const totalOwed = useMemo(
    () => owed.reduce((sum, d) => sum + d.total, 0),
    [owed]
  );

  const runAction = useCallback(
    async (action: () => Promise<Response>, successMsg: string) => {
      setError("");
      setNotice("");
      setBusy(true);
      try {
        const res = await action();
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "הפעולה נכשלה");
        await load();
        await refreshMember();
        setNotice(successMsg);
      } catch (err) {
        setError(err instanceof Error ? err.message : "הפעולה נכשלה");
      } finally {
        setBusy(false);
      }
    },
    [load, refreshMember]
  );

  const handleTransfer = useCallback(async () => {
    const token = await getIdToken();
    if (!token) return;
    const value = Number(amount);
    if (!toMemberId) {
      setError("יש לבחור למי להעביר");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("סכום ההעברה אינו תקין");
      return;
    }
    await runAction(
      () =>
        authFetch("/api/account/peer/transfer", {
          method: "POST",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toMemberId, amount: value }),
        }),
      "הקרדיט הועבר בהצלחה 🎉"
    );
    setAmount("");
    setToMemberId("");
    setMemberQuery("");
  }, [amount, toMemberId, getIdToken, runAction]);

  const handleRepay = useCallback(
    async (lenderId: string) => {
      const token = await getIdToken();
      if (!token) return;
      await runAction(
        () =>
          authFetch("/api/account/peer/repay", {
            method: "POST",
            token,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lenderId }),
          }),
        "החוב הוחזר במלואו ✅"
      );
    },
    [getIdToken, runAction]
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="העו״ש שלי"
        description="כל התנועות ביתרה — טעינות קרדיט, תשלומים והלוואות בין חברים."
      />

      <Card className="mb-6 border-emerald-200 bg-emerald-50 shadow-sm">
        <CardBody className="py-6 text-center">
          <p className="text-sm font-semibold text-emerald-800">היתרה שלך</p>
          <p className="mt-1 text-4xl font-bold text-emerald-900">{formatCredits(balance)}</p>
        </CardBody>
      </Card>

      {member && !isPaidMember(member) && (
        <JoinMembershipBanner className="mb-6" />
      )}

      {notice && (
        <Alert variant="success" className="mb-4">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
        </div>
      ) : (
        <>
          {/* ── Mutual guarantee: debts you owe ─────────────────────────── */}
          {owed.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-base font-bold text-stone-900">החובות שלכם</h2>
              <div className="space-y-2">
                {owed.map((debt) => {
                  const canRepay = balance >= debt.total;
                  return (
                    <Card key={debt.counterpartyId} className="border-red-200 bg-red-50">
                      <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-semibold text-red-900">
                            אתם חייבים {formatCredits(debt.total)} לחבר {debt.counterpartyName}
                          </p>
                          {!canRepay && (
                            <p className="mt-0.5 text-xs text-red-700">
                              צריך {formatCredits(debt.total)} ביתרה כדי להחזיר — המתינו לטעינת יתרה.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!canRepay || busy}
                          onClick={() => handleRepay(debt.counterpartyId)}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          החזר חוב
                        </button>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Mutual guarantee: debts owed to you ─────────────────────── */}
          {lent.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-base font-bold text-stone-900">חייבים לכם</h2>
              <div className="space-y-2">
                {lent.map((debt) => (
                  <Card key={debt.counterpartyId} className="border-emerald-200 bg-emerald-50">
                    <CardBody className="py-3">
                      <p className="font-semibold text-emerald-900">
                        החבר {debt.counterpartyName} חייב לכם {formatCredits(debt.total)}
                      </p>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* ── Transfer credit to a neighbor (only if you have credit) ─── */}
          {balance > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-base font-bold text-stone-900">
              העברת קרדיט לחבר (ערבות הדדית)
            </h2>
            <Card>
              <CardBody className="space-y-3 py-4">
                <p className="text-sm text-[var(--muted)]">
                  חבר נתקע בלי יתרה? העבירו לו קרדיט בלחיצת כפתור. המערכת תזכור את החוב
                  אוטומטית עד שיוחזר.
                </p>
                <div className="relative">
                  <label className="mb-1 block text-sm font-semibold text-stone-800">
                    למי להעביר
                  </label>
                  <input
                    type="text"
                    value={memberQuery}
                    onChange={(e) => {
                      setMemberQuery(e.target.value);
                      setToMemberId("");
                      setMemberListOpen(true);
                    }}
                    onFocus={() => setMemberListOpen(true)}
                    onBlur={() => setTimeout(() => setMemberListOpen(false), 150)}
                    placeholder="הקלידו שם חבר לחיפוש…"
                    autoComplete="off"
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                  />
                  {memberListOpen && (
                    <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg">
                      {filteredMembers.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-[var(--muted)]">לא נמצאו חברים</li>
                      ) : (
                        filteredMembers.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setToMemberId(m.id);
                                setMemberQuery(m.name);
                                setMemberListOpen(false);
                              }}
                              className={
                                "flex w-full items-center px-3 py-2 text-right text-sm transition hover:bg-kerem-50 " +
                                (m.id === toMemberId ? "bg-kerem-50 font-semibold text-kerem-800" : "text-stone-800")
                              }
                            >
                              {m.name}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-stone-800">
                    כמה קרדיטים
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="לדוגמה: 35"
                    className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    היתרה הזמינה שלך: {formatCredits(balance)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || !toMemberId || !amount}
                  onClick={handleTransfer}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-kerem-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-kerem-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "מעביר…" : "העבר קרדיט"}
                </button>
              </CardBody>
            </Card>
          </section>
          )}

          {/* ── Transactions ───────────────────────────────────────────── */}
          <h2 className="mb-3 text-base font-bold text-stone-900">תנועות בחשבון</h2>
          {totalOwed > 0 && (
            <p className="mb-3 text-xs text-[var(--muted)]">
              שימו לב: מתוך היתרה שלכם, {formatCredits(totalOwed)} מיועדים להחזר חוב לחברים.
            </p>
          )}
          {entries.length === 0 ? (
            <Card className="border-dashed">
              <CardBody className="py-16 text-center">
                <span className="mb-4 inline-block text-5xl">🧾</span>
                <p className="text-lg font-semibold text-stone-800">אין תנועות עדיין</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  כאן יופיעו טעינות קרדיט, תשלומים והשאלות שביצעתם.
                </p>
              </CardBody>
            </Card>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => {
                const positive = entry.delta >= 0;
                return (
                  <li key={entry.id}>
                    <Card>
                      <CardBody className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-stone-900">
                            {describeEntry(entry)}
                          </p>
                          {entry.note && entry.note !== describeEntry(entry) && (
                            <p className="truncate text-xs text-[var(--muted)]">{entry.note}</p>
                          )}
                          <p className="text-xs text-[var(--muted)]">
                            {formatDateTime(entry.createdAt)}
                          </p>
                        </div>
                        <div className="shrink-0 text-left">
                          <p
                            className={
                              positive
                                ? "text-base font-bold text-emerald-700"
                                : "text-base font-bold text-red-700"
                            }
                          >
                            {positive ? "+" : "−"}
                            {formatCredits(Math.abs(entry.delta))}
                          </p>
                          <p className="text-[11px] text-[var(--muted)]">
                            יתרה: {formatCredits(entry.balanceAfter)}
                          </p>
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="mt-8 border-t border-[var(--border)] pt-4 text-center">
        <Link
          href="/takanon"
          className="text-sm font-medium text-kerem-700 underline hover:text-kerem-800"
        >
          תקנון ותנאי שימוש
        </Link>
      </div>
    </div>
  );
}
