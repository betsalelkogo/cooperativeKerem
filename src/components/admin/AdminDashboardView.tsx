"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { authFetch } from "@/lib/api-client";
import { loanStatusLabels, reservationStatusLabels } from "@/lib/labels";
import { formatDateHe } from "@/lib/dates";
import { gemachPricingModeLabels } from "@/lib/gemach";
import { formatNIS } from "@/lib/pots";
import { AdminToolKindsTable } from "@/components/admin/AdminToolKindsTable";
import { ProblemReportsPanel } from "@/components/admin/ProblemReportsPanel";
import { LoanPhotoThumb } from "@/components/admin/LoanPhotoThumb";
import type { AdminDashboardData, AdminDashboardLoan } from "@/lib/types";

/**
 * Group active loans by booking. New multi-unit loans are a single doc (with a
 * `quantity`), while legacy data stored one doc per unit linked by `groupId`.
 */
function groupAdminLoans(loans: AdminDashboardLoan[]): AdminDashboardLoan[][] {
  const groups = new Map<string, AdminDashboardLoan[]>();
  for (const loan of loans) {
    const key = loan.groupId ?? loan.id;
    const existing = groups.get(key);
    if (existing) existing.push(loan);
    else groups.set(key, [loan]);
  }
  return [...groups.values()];
}

/** Number of physical units represented by a group of loan docs. */
function loanGroupUnits(group: AdminDashboardLoan[]): number {
  return group.reduce((sum, loan) => sum + (loan.quantity ?? 1), 0);
}

function CountBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="mr-2 rounded-full bg-kerem-100 px-2 py-0.5 text-xs font-bold text-kerem-800">
      ×{count}
    </span>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardBody className="py-4 text-center">
        <p className={`text-3xl font-bold ${accent ?? "text-kerem-800"}`}>{value}</p>
        <p className="mt-1 text-xs font-medium text-[var(--muted)]">{label}</p>
      </CardBody>
    </Card>
  );
}

function formatDateTime(iso?: string) {
  return formatDateHe(iso, true);
}

function formatDay(date?: string) {
  return formatDateHe(date, false);
}

interface AdminDashboardViewProps {
  data: AdminDashboardData;
  title: string;
  description: string;
  showGemachColumn?: boolean;
  showGemachimList?: boolean;
  editableTools?: boolean;
  cooperativeOnly?: boolean;
  showLateFees?: boolean;
  gemachId?: string;
  getToken?: () => Promise<string | null>;
  onToolsUpdated?: () => void;
  onRefresh?: () => void;
}

export function AdminDashboardView({
  data,
  title,
  description,
  showGemachColumn = false,
  showGemachimList = false,
  editableTools = false,
  cooperativeOnly = false,
  showLateFees = false,
  gemachId,
  getToken,
  onToolsUpdated,
  onRefresh,
}: AdminDashboardViewProps) {
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [lateFeeError, setLateFeeError] = useState("");

  async function markLateFeePaid(feeId: string) {
    if (!getToken) return;
    setMarkingPaidId(feeId);
    setLateFeeError("");
    try {
      const token = await getToken();
      const res = await authFetch(`/api/admin/late-fees/${encodeURIComponent(feeId)}`, {
        method: "PATCH",
        token,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "עדכון נכשל");
      onRefresh?.();
    } catch (err) {
      setLateFeeError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setMarkingPaidId(null);
    }
  }

  return (
    <div>
      <PageHeader title={title} description={description} />

      {data.gemach && (
        <Card className={`mb-6 ${data.gemach.active ? "border-kerem-200" : "border-red-200"}`}>
          <CardBody className="py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-[var(--muted)]">גמ״ח</p>
                <p className="text-xl font-bold text-stone-900">{data.gemach.name}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {gemachPricingModeLabels[data.gemach.pricingMode]}
                </p>
              </div>
              {!data.gemach.active && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                  סגור
                </span>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-8">
        <StatCard label="סה״כ כלים" value={data.stats.totalTools} />
        <StatCard label="זמינים" value={data.stats.available} accent="text-emerald-700" />
        <StatCard label="מושאלים" value={data.stats.onLoan} accent="text-amber-700" />
        <StatCard label="שריונים פעילות" value={data.stats.activeReservations} accent="text-sky-700" />
        <StatCard label="בתחזוקה" value={data.stats.maintenance} accent="text-orange-700" />
        <StatCard label="השאלות פעילות" value={data.stats.activeLoans} accent="text-violet-700" />
        <StatCard
          label="דיווחי בעיות"
          value={data.stats.openProblemReports}
          accent={data.stats.openProblemReports > 0 ? "text-red-700" : undefined}
        />
        <StatCard
          label="קנסות שלא שולמו"
          value={data.stats.unpaidLateFees}
          accent={data.stats.unpaidLateFees > 0 ? "text-red-700" : undefined}
        />
      </div>

      {showLateFees && data.lateReturnFees.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-stone-900">⏱ איחורים — קנסות ממתינים לתשלום</h2>
          {lateFeeError && (
            <Alert variant="error" className="mb-4">
              {lateFeeError}
            </Alert>
          )}
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-warm-50 text-right">
                  <th className="px-4 py-3 font-semibold text-stone-700">משתמש</th>
                  <th className="px-4 py-3 font-semibold text-stone-700">כלי</th>
                  <th className="px-4 py-3 font-semibold text-stone-700">איחור</th>
                  <th className="px-4 py-3 font-semibold text-stone-700">קנס</th>
                  <th className="px-4 py-3 font-semibold text-stone-700">הוחזר</th>
                  <th className="px-4 py-3 font-semibold text-stone-700">סטטוס</th>
                  <th className="px-4 py-3 font-semibold text-stone-700">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {data.lateReturnFees.map((fee) => (
                  <tr key={fee.id} className="border-b border-[var(--border)]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-stone-900">{fee.memberName}</p>
                      <p className="text-xs text-[var(--muted)]">{fee.memberEmail}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-900">{fee.toolName}</td>
                    <td className="px-4 py-3 text-red-700">{fee.lateDurationLabel}</td>
                    <td className="px-4 py-3 font-semibold">{formatNIS(fee.amount)}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatDateTime(fee.returnedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                        לא שולם
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={markingPaidId === fee.id}
                        onClick={() => markLateFeePaid(fee.id)}
                      >
                        {markingPaidId === fee.id ? "שומר…" : "סומן כשולם"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data.problemReports.length > 0 && (
        <ProblemReportsPanel
          reports={data.problemReports}
          showGemachColumn={showGemachColumn}
          getToken={getToken ?? (async () => null)}
          onUpdated={onRefresh}
        />
      )}

      {showGemachimList && data.gemachim && data.gemachim.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-stone-900">גמ״חים בפלטפורמה</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.gemachim.map((gemach) => (
              <Card key={gemach.id}>
                <CardBody className="py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-stone-900">{gemach.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {gemachPricingModeLabels[gemach.pricingMode]}
                      </p>
                    </div>
                    {!gemach.active ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                        סגור
                      </span>
                    ) : gemach.isPlatform ? (
                      <span className="rounded-full bg-kerem-100 px-2.5 py-1 text-xs font-bold text-kerem-800">
                        פלטפורמה
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                        ★ שותף
                      </span>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}

      <AdminToolKindsTable
        tools={data.tools}
        showGemachColumn={showGemachColumn}
        editable={editableTools}
        cooperativeOnly={cooperativeOnly}
        gemachId={gemachId}
        gemachim={data.gemachim}
        getToken={getToken ?? (async () => null)}
        onUpdated={onToolsUpdated ?? onRefresh}
      />

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-bold text-stone-900">שריונים פעילות</h2>
        {data.activeReservations.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center text-[var(--muted)]">
              אין שריונים פעילות כרגע
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.activeReservations.map((reservation) => {
              const units = reservation.quantity ?? 1;
              return (
                <Card key={reservation.id}>
                  <CardBody className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-stone-900">
                          {reservation.toolName}
                          <CountBadge count={units} />
                          {units > 1 && (
                            <span className="mr-1 text-sm font-semibold text-kerem-700">
                              ({units} יחידות)
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm text-stone-700">{reservation.memberName}</p>
                        <p className="text-xs text-[var(--muted)]">{reservation.memberEmail}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                        {reservationStatusLabels[reservation.status]}
                      </span>
                    </div>
                    <p className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                      <span className="block">נשמר: {formatDateTime(reservation.createdAt)}</span>
                      <span className="block">איסוף מתוכנן: {formatDay(reservation.pickupDate)}</span>
                      <span className="block">החזרה מתוכננת: {formatDay(reservation.returnDate)}</span>
                    </p>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-stone-900">השאלות פעילות</h2>
        {data.activeLoans.length === 0 ? (
          <Card>
            <CardBody className="py-8 text-center text-[var(--muted)]">
              אין השאלות פעילות כרגע
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groupAdminLoans(data.activeLoans).map((group) => {
              const loan = group[0];
              const units = loanGroupUnits(group);
              const photos = group.filter((l) => l.checkoutPhotoUrl || l.returnPhotoUrl);
              return (
                <Card key={loan.id}>
                  <CardBody className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-stone-900">
                          {loan.toolName}
                          <CountBadge count={units} />
                          {units > 1 && (
                            <span className="mr-1 text-sm font-semibold text-kerem-700">
                              ({units} יחידות)
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm text-stone-700">{loan.memberName}</p>
                        <p className="text-xs text-[var(--muted)]">{loan.memberEmail}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800 ring-1 ring-inset ring-violet-200">
                        {loanStatusLabels[loan.status]}
                      </span>
                    </div>
                    <p className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                      <span className="block">לקיחה בפועל: {formatDateTime(loan.checkedOutAt)}</span>
                      <span className="block">החזרה מתוכננת: {formatDay(loan.dueReturnDate)}</span>
                    </p>
                    {photos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {photos.map((l) => (
                          <div key={l.id} className="flex gap-2">
                            {l.checkoutPhotoUrl && (
                              <LoanPhotoThumb url={l.checkoutPhotoUrl} label="לקיחה" />
                            )}
                            {l.returnPhotoUrl && (
                              <LoanPhotoThumb url={l.returnPhotoUrl} label="החזרה" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export function AdminDashboardLoading() {
  return (
    <div className="flex justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-kerem-200 border-t-kerem-700" />
    </div>
  );
}

export function AdminDashboardError({ message }: { message: string }) {
  return <Alert variant="error">{message || "לא ניתן לטעון נתונים"}</Alert>;
}
