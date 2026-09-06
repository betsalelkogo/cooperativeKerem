import { gemachAdminIdsFromData, roleFromMemberData } from "@/lib/admin";
import { normalizeGemachId } from "@/lib/gemach";
import { resolveKindId } from "@/lib/tool-kinds";
import type {
  AccessCodesRecord,
  CreditLedgerEntry,
  DevicePot,
  Dispute,
  Gemach,
  LateReturnFee,
  Loan,
  MaintenanceTicket,
  Member,
  MemberPayment,
  OperationsPot,
  PayboxPayout,
  PayboxSettings,
  PeerCreditLoan,
  Reservation,
  Tool,
  Transaction,
} from "@/lib/types";
import { getDefaultPayboxSettings } from "@/lib/paybox/config";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringOpt(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNumberOpt(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === "string");
  return items.length ? items : undefined;
}

export function toolFromRow(row: Record<string, unknown>): Tool {
  const id = asString(row.id);
  return {
    id,
    name: asString(row.name, id),
    description: asString(row.description),
    category: asString(row.category),
    qrCode: asString(row.qr_code, id),
    status: (asString(row.status, "available") as Tool["status"]) ?? "available",
    loanFeeMin: asNumber(row.loan_fee_min),
    loanFeeMax: asNumber(row.loan_fee_max),
    safetyRules: Array.isArray(row.safety_rules) ? (row.safety_rules as Tool["safetyRules"]) : [],
    includedItems: Array.isArray(row.included_items)
      ? (row.included_items as Tool["includedItems"])
      : undefined,
    imageUrl: asStringOpt(row.image_url),
    adminNotes: asStringOpt(row.admin_notes),
    gemachId: normalizeGemachId(asString(row.gemach_id, "kerem")),
    kindId: resolveKindId({ kindId: row.kind_id }, id),
    unitLabel: asStringOpt(row.unit_label),
    defaultLoanHours: asNumberOpt(row.default_loan_hours),
    maxLoanHours: asNumberOpt(row.max_loan_hours),
    location: asStringOpt(row.location),
    brand: asStringOpt(row.brand),
    supplier: asStringOpt(row.supplier),
    purpose: asStringOpt(row.purpose),
    productAge: asNumberOpt(row.product_age),
    youtubeUrl: asStringOpt(row.youtube_url),
    imageUrls: asStringArray(row.image_urls),
  };
}

export function gemachFromRow(row: Record<string, unknown>): Gemach {
  const id = asString(row.id);
  return {
    id,
    name: asString(row.name, id),
    slug: asString(row.slug, id),
    description: asStringOpt(row.description),
    pricingMode: (asString(row.pricing_mode, "loan_fee") as Gemach["pricingMode"]) ?? "loan_fee",
    maintenanceFee: asNumberOpt(row.maintenance_fee),
    payboxGroupUrl: asStringOpt(row.paybox_group_url),
    isPlatform: asBool(row.is_platform),
    active: row.active !== false,
    reservationMode: asStringOpt(row.reservation_mode) as Gemach["reservationMode"] | undefined,
    defaultLoanHours: asNumberOpt(row.default_loan_hours),
    maxLoanHours: asNumberOpt(row.max_loan_hours),
    closedAt: asIso(row.closed_at),
    cooperativeFee: asNumberOpt(row.cooperative_fee),
    location: asStringOpt(row.location),
  };
}

export function memberFromRow(row: Record<string, unknown>): Member {
  return {
    id: asString(row.id),
    name: asString(row.name, "חבר"),
    firstName: asStringOpt(row.first_name),
    familyName: asStringOpt(row.family_name),
    nameCompleted: asBool(row.name_completed),
    email: asString(row.email),
    phone: asStringOpt(row.phone),
    isAmember: asBool(row.is_a_member),
    firstPayout: row.first_payout !== false,
    termsAcceptedAt: asIso(row.terms_accepted_at),
    membershipOfferDismissedAt: asIso(row.membership_offer_dismissed_at),
    hasPaymentMethod: asBool(row.has_payment_method),
    role: roleFromMemberData({
      role: row.role,
      gemachAdminIds: row.gemach_admin_ids,
    }),
    gemachAdminIds: gemachAdminIdsFromData({ gemachAdminIds: row.gemach_admin_ids }),
    creditBalance: asNumber(row.credit_balance),
  };
}

export function reservationFromRow(row: Record<string, unknown>): Reservation {
  return {
    id: asString(row.id),
    memberId: asString(row.member_id),
    toolId: asString(row.tool_id),
    pickupDate: asString(row.pickup_date),
    pickupTimeStart: asStringOpt(row.pickup_time_start),
    pickupTimeEnd: asStringOpt(row.pickup_time_end),
    returnDate: asString(row.return_date),
    returnTimeStart: asStringOpt(row.return_time_start),
    returnTimeEnd: asStringOpt(row.return_time_end),
    status: (asString(row.status, "pending") as Reservation["status"]) ?? "pending",
    feeAmount: asNumber(row.fee_amount),
    loanDurationHours: asNumberOpt(row.loan_duration_hours),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    kindId: asStringOpt(row.kind_id),
    quantity: asNumberOpt(row.quantity),
    toolIds: asStringArray(row.tool_ids),
    groupId: asStringOpt(row.group_id),
    cooperativeFeeAmount: asNumberOpt(row.cooperative_fee_amount),
    cancelReason:
      row.cancel_reason === "member" || row.cancel_reason === "no_show"
        ? row.cancel_reason
        : undefined,
    cancelledAt: asIso(row.cancelled_at),
  };
}

export function loanFromRow(row: Record<string, unknown>): Loan {
  return {
    id: asString(row.id),
    reservationId: asString(row.reservation_id),
    memberId: asString(row.member_id),
    toolId: asString(row.tool_id),
    toolIds: asStringArray(row.tool_ids),
    quantity: asNumberOpt(row.quantity),
    status: asString(row.status, "active") as Loan["status"],
    safetyAcknowledged: asBool(row.safety_acknowledged),
    checkoutPhotoUrl: asStringOpt(row.checkout_photo_url),
    returnPhotoUrl: asStringOpt(row.return_photo_url),
    checkoutConditionNotes: asStringOpt(row.checkout_condition_notes),
    returnConditionNotes: asStringOpt(row.return_condition_notes),
    checkoutItemsChecked: asStringArray(row.checkout_items_checked),
    returnItemsChecked: asStringArray(row.return_items_checked),
    additionalPhotoUrls: asStringArray(row.additional_photo_urls),
    checkedOutAt: asIso(row.checked_out_at),
    dueReturnDate: asStringOpt(row.due_return_date),
    dueReturnTimeEnd: asStringOpt(row.due_return_time_end),
    returnedAt: asIso(row.returned_at),
    groupId: asStringOpt(row.group_id),
    checkoutDefect:
      row.checkout_defect && typeof row.checkout_defect === "object"
        ? (row.checkout_defect as Loan["checkoutDefect"])
        : undefined,
    returnDefect:
      row.return_defect && typeof row.return_defect === "object"
        ? (row.return_defect as Loan["returnDefect"])
        : undefined,
    returnOk: row.return_ok === true ? true : undefined,
    disputeId: asStringOpt(row.dispute_id),
  };
}

export function paymentFromRow(row: Record<string, unknown>): MemberPayment {
  return {
    id: asString(row.id),
    reservationId: asString(row.reservation_id),
    memberId: asString(row.member_id),
    toolId: asString(row.tool_id),
    amount: asNumber(row.amount),
    status: asString(row.status, "pending") as MemberPayment["status"],
    provider: asString(row.provider, "credit") as MemberPayment["provider"],
    payboxGroupUrl: asString(row.paybox_group_url),
    growPaymentUrl: asStringOpt(row.grow_payment_url),
    creditApplied: asNumberOpt(row.credit_applied),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    paidAt: asIso(row.paid_at),
    refundedAt: asIso(row.refunded_at),
  };
}

export function lateFeeFromRow(row: Record<string, unknown>): LateReturnFee {
  return {
    id: asString(row.id),
    loanId: asString(row.loan_id),
    reservationId: asString(row.reservation_id),
    memberId: asString(row.member_id),
    toolId: asString(row.tool_id),
    gemachId: asString(row.gemach_id, "kerem"),
    dueAt: asIso(row.due_at) ?? new Date().toISOString(),
    returnedAt: asIso(row.returned_at) ?? new Date().toISOString(),
    lateMinutes: asNumber(row.late_minutes),
    amount: asNumber(row.amount),
    paid: asBool(row.paid),
    paidAt: asIso(row.paid_at),
    markedPaidBy: asStringOpt(row.marked_paid_by),
    cancelled: asBool(row.cancelled),
    cancelledAt: asIso(row.cancelled_at),
    cancelledBy: asStringOpt(row.cancelled_by),
    cancelReason: asStringOpt(row.cancel_reason),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function ticketFromRow(row: Record<string, unknown>): MaintenanceTicket {
  return {
    id: asString(row.id),
    toolId: asString(row.tool_id),
    loanId: asStringOpt(row.loan_id),
    memberId: asString(row.member_id),
    description: asString(row.description),
    status: asString(row.status, "open") as MaintenanceTicket["status"],
    adminReply: asStringOpt(row.admin_reply),
    resolvedAt: asIso(row.resolved_at),
    resolvedBy: asStringOpt(row.resolved_by),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function disputeFromRow(row: Record<string, unknown>): Dispute {
  return {
    id: asString(row.id),
    loanId: asString(row.loan_id),
    toolId: asString(row.tool_id),
    memberId: asString(row.member_id),
    gemachId: asString(row.gemach_id, "kerem"),
    status: asString(row.status, "new") as Dispute["status"],
    defect: (row.defect && typeof row.defect === "object"
      ? row.defect
      : { category: "other", description: "", reportedAt: new Date().toISOString() }) as Dispute["defect"],
    damageAmount: asNumberOpt(row.damage_amount),
    mediatorIds: asStringArray(row.mediator_ids) ?? [],
    mediatorDecisions:
      row.mediator_decisions && typeof row.mediator_decisions === "object"
        ? (row.mediator_decisions as Dispute["mediatorDecisions"])
        : undefined,
    resolvedAt: asIso(row.resolved_at),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function ledgerFromRow(row: Record<string, unknown>): CreditLedgerEntry {
  return {
    id: asString(row.id),
    memberId: asString(row.member_id),
    delta: asNumber(row.delta),
    balanceAfter: asNumber(row.balance_after),
    reason: asString(row.reason) as CreditLedgerEntry["reason"],
    note: asStringOpt(row.note),
    reservationId: asStringOpt(row.reservation_id),
    peerLoanId: asStringOpt(row.peer_loan_id),
    createdBy: asString(row.created_by),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function peerLoanFromRow(row: Record<string, unknown>): PeerCreditLoan {
  return {
    id: asString(row.id),
    lenderId: asString(row.lender_id),
    lenderName: asString(row.lender_name),
    borrowerId: asString(row.borrower_id),
    borrowerName: asString(row.borrower_name),
    principal: asNumber(row.principal),
    outstanding: asNumber(row.outstanding),
    status: asString(row.status, "open") as PeerCreditLoan["status"],
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    settledAt: asIso(row.settled_at),
  };
}

export function payoutFromRow(row: Record<string, unknown>): PayboxPayout {
  return {
    id: asString(row.id),
    potTarget: asString(row.pot_target, "operations") as PayboxPayout["potTarget"],
    toolId: asStringOpt(row.tool_id),
    amount: asNumber(row.amount),
    groupUrl: asString(row.group_url),
    status: asString(row.status, "pending") as PayboxPayout["status"],
    note: asStringOpt(row.note),
    createdBy: asString(row.created_by),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
    completedAt: asIso(row.completed_at),
  };
}

export function transactionFromRow(row: Record<string, unknown>): Transaction {
  return {
    id: asString(row.id),
    memberId: asString(row.member_id),
    toolId: asString(row.tool_id),
    loanId: asString(row.loan_id),
    amount: asNumber(row.amount),
    operationsAmount: asNumber(row.operations_amount),
    deviceAmount: asNumber(row.device_amount),
    createdAt: asIso(row.created_at) ?? new Date().toISOString(),
  };
}

export function devicePotFromRow(row: Record<string, unknown>): DevicePot & { id: string } {
  return {
    id: asString(row.id),
    toolId: asString(row.tool_id, asString(row.id)),
    balance: asNumber(row.balance),
    totalEarned: asNumber(row.total_earned),
    totalSpent: asNumber(row.total_spent),
  };
}

export function operationsPotFromRow(row: Record<string, unknown> | undefined): OperationsPot {
  if (!row) return { balance: 0, totalEarned: 0, totalSpent: 0 };
  return {
    balance: asNumber(row.balance),
    totalEarned: asNumber(row.total_earned),
    totalSpent: asNumber(row.total_spent),
  };
}

export function payboxSettingsFromData(data: Record<string, unknown> | undefined): PayboxSettings {
  const defaults = getDefaultPayboxSettings();
  if (!data) return defaults;
  return {
    enabled: asBool(data.enabled, defaults.enabled),
    operationsGroupUrl: asString(data.operationsGroupUrl, defaults.operationsGroupUrl),
    deviceGroupUrl: asString(data.deviceGroupUrl, defaults.deviceGroupUrl),
    groupName: asStringOpt(data.groupName),
    growPageCode: asString(data.growPageCode, defaults.growPageCode),
  };
}

export function accessCodesFromData(data: Record<string, unknown> | undefined): AccessCodesRecord {
  return {
    caravanCode: asString(data?.caravanCode),
    caravanNote: asString(data?.caravanNote),
    clubRoomCode: asString(data?.clubRoomCode),
    clubRoomNote: asString(data?.clubRoomNote),
    clubRoomUpdatedAt: asIso(data?.clubRoomUpdatedAt) ?? null,
  };
}
