import type { Dispute, DisputeStatus, MediatorDecision } from "@/lib/types";

const OPEN_DISPUTE_STATUSES: DisputeStatus[] = [
  "new",
  "mediators_assigned",
  "deliberating",
];

export function isDisputeOpen(status: DisputeStatus): boolean {
  return OPEN_DISPUTE_STATUSES.includes(status);
}

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  new: "חדשה",
  mediators_assigned: "נבחרו מיישבים",
  deliberating: "בבירור",
  resolved_charge: "הוכרע — חיוב",
  resolved_waive: "הוכרע — פטור",
  closed: "נסגרה",
};

export function disputeProgressLabel(dispute: Dispute): string {
  const votes = Object.values(dispute.mediatorDecisions ?? {});
  const decided = votes.filter((v) => v !== "abstain").length;
  const total = dispute.mediatorIds.length;
  if (dispute.status === "new") return "ממתין לשיבוץ מיישבים";
  if (dispute.status === "mediators_assigned") return `0 מתוך ${total} מיישבים הכריעו`;
  if (dispute.status === "deliberating") return `${decided} מתוך ${total} מיישבים הכריעו`;
  return DISPUTE_STATUS_LABELS[dispute.status];
}

export const MEDIATOR_DECISION_LABELS: Record<MediatorDecision, string> = {
  charge_member: "חייב חבר",
  waive_member: "פטור חבר",
  abstain: "נמנע",
};

export function tallyMediatorVotes(
  decisions: Record<string, MediatorDecision>
): { charge: number; waive: number } {
  let charge = 0;
  let waive = 0;
  for (const v of Object.values(decisions)) {
    if (v === "charge_member") charge += 1;
    if (v === "waive_member") waive += 1;
  }
  return { charge, waive };
}

/** Pick up to 3 random eligible members (excluding parties). */
export function pickRandomMediators(
  candidates: Array<{ id: string; role?: string }>,
  excludeIds: string[],
  count = 3
): string[] {
  const pool = candidates.filter(
    (m) => !excludeIds.includes(m.id) && m.role !== "ADMIN"
  );
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((m) => m.id);
}
