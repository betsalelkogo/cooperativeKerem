"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";
import { defectCategoryLabel } from "@/lib/defects";
import {
  DISPUTE_STATUS_LABELS,
  MEDIATOR_DECISION_LABELS,
} from "@/lib/disputes";
import { formatDateHe } from "@/lib/dates";
import { LoanPhotoThumb } from "@/components/admin/LoanPhotoThumb";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import type {
  AdminDisputeDetail,
  AdminMemberSummary,
  MediatorDecision,
} from "@/lib/types";

interface DisputeDetailPanelProps {
  detail: AdminDisputeDetail;
  members: AdminMemberSummary[];
  getToken: () => Promise<string | null>;
  onUpdated: (detail: AdminDisputeDetail) => void;
}

export function DisputeDetailPanel({
  detail,
  members,
  getToken,
  onUpdated,
}: DisputeDetailPanelProps) {
  const [error, setError] = useState("");
  const [voting, setVoting] = useState(false);
  const [savingMediators, setSavingMediators] = useState(false);
  const [selectedMediators, setSelectedMediators] = useState<string[]>(
    detail.mediators.map((m) => m.id)
  );

  useEffect(() => {
    setSelectedMediators(detail.mediators.map((m) => m.id));
  }, [detail.id, detail.mediators]);

  async function submitVote(decision: MediatorDecision) {
    setVoting(true);
    setError("");
    try {
      const token = await getToken();
      const res = await authFetch(
        `/api/disputes/${encodeURIComponent(detail.id)}/vote`,
        {
          method: "POST",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "הצבעה נכשלה");

      const refresh = await authFetch(
        `/api/admin/disputes/${encodeURIComponent(detail.id)}`,
        { token }
      );
      const refreshed = await refresh.json();
      if (!refresh.ok) throw new Error(refreshed.error ?? "רענון נכשל");
      onUpdated(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setVoting(false);
    }
  }

  async function saveMediators() {
    setSavingMediators(true);
    setError("");
    try {
      const token = await getToken();
      const res = await authFetch(
        `/api/admin/disputes/${encodeURIComponent(detail.id)}`,
        {
          method: "PATCH",
          token,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediatorIds: selectedMediators }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      onUpdated(data);
      setSelectedMediators(data.mediators.map((m: { id: string }) => m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSavingMediators(false);
    }
  }

  function toggleMediator(memberId: string) {
    setSelectedMediators((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, memberId];
    });
  }

  const eligibleMembers = members.filter((m) => m.id !== detail.memberId);

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        <CardBody className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-stone-900">{detail.toolName}</p>
              <p className="text-sm text-[var(--muted)]">
                {detail.memberName} · {detail.memberEmail}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
              {DISPUTE_STATUS_LABELS[detail.status]}
            </span>
          </div>
          <p className="text-sm text-stone-700">{detail.progressLabel}</p>
          <p className="text-xs text-[var(--muted)]">
            נפתחה: {formatDateHe(detail.createdAt, true)}
            {detail.resolvedAt &&
              ` · הוכרעה: ${formatDateHe(detail.resolvedAt, true)}`}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 py-4">
          <h3 className="font-bold text-stone-900">דיווח התקלה</h3>
          <p className="text-sm font-medium text-stone-800">
            {defectCategoryLabel(detail.defect.category)}
          </p>
          <p className="rounded-lg bg-warm-50 px-3 py-2 text-sm text-stone-800">
            {detail.defect.description || "—"}
          </p>
        </CardBody>
      </Card>

      {(detail.loan.checkoutPhotoUrl || detail.loan.returnPhotoUrl) && (
        <Card>
          <CardBody className="space-y-3 py-4">
            <h3 className="font-bold text-stone-900">תמונות השאלה</h3>
            <div className="flex flex-wrap gap-3">
              {detail.loan.checkoutPhotoUrl && (
                <LoanPhotoThumb url={detail.loan.checkoutPhotoUrl} label="לקיחה" />
              )}
              {detail.loan.returnPhotoUrl && (
                <LoanPhotoThumb url={detail.loan.returnPhotoUrl} label="החזרה" />
              )}
            </div>
            {detail.loan.checkoutConditionNotes && (
              <p className="text-sm text-stone-700">
                <span className="font-medium">מצב בלקיחה:</span>{" "}
                {detail.loan.checkoutConditionNotes}
              </p>
            )}
            {detail.loan.returnConditionNotes && (
              <p className="text-sm text-stone-700">
                <span className="font-medium">מצב בהחזרה:</span>{" "}
                {detail.loan.returnConditionNotes}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-3 py-4">
          <h3 className="font-bold text-stone-900">מיישבים</h3>
          {detail.mediators.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">טרם שובצו מיישבים</p>
          ) : (
            <ul className="space-y-2">
              {detail.mediators.map((mediator) => (
                <li
                  key={mediator.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <span className="font-medium">{mediator.name}</span>
                  <span className="text-[var(--muted)]">
                    {mediator.decision
                      ? MEDIATOR_DECISION_LABELS[mediator.decision]
                      : "ממתין להכרעה"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {detail.canAssignMediators && (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <p className="text-sm font-medium text-stone-800">
                שיבוץ מיישבים (עד 3)
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
                {eligibleMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-warm-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMediators.includes(member.id)}
                      onChange={() => toggleMediator(member.id)}
                      disabled={
                        !selectedMediators.includes(member.id) &&
                        selectedMediators.length >= 3
                      }
                    />
                    <span>
                      {member.name}{" "}
                      <span className="text-[var(--muted)]">({member.email})</span>
                    </span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                disabled={savingMediators || selectedMediators.length === 0}
                onClick={saveMediators}
              >
                {savingMediators ? "שומר…" : "שמור שיבוץ מיישבים"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {detail.canVote && !detail.myDecision && (
        <Card className="border-kerem-200">
          <CardBody className="space-y-3 py-4">
            <h3 className="font-bold text-kerem-900">הכרעה שלך</h3>
            <p className="text-sm text-stone-700">
              את/ה משובץ/ת כמיישב/ת במחלוקת זו. בחר/י החלטה:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="danger"
                disabled={voting}
                onClick={() => submitVote("charge_member")}
              >
                חייב חבר
              </Button>
              <Button
                type="button"
                disabled={voting}
                onClick={() => submitVote("waive_member")}
              >
                פטור חבר
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={voting}
                onClick={() => submitVote("abstain")}
              >
                נמנע
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {detail.myDecision && (
        <Alert variant="info">
          ההחלטה שלך: <strong>{MEDIATOR_DECISION_LABELS[detail.myDecision]}</strong>
        </Alert>
      )}
    </div>
  );
}
