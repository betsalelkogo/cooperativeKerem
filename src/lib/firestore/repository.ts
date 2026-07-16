import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb, omitUndefined } from "@/lib/firebase/admin-app";
import type {
  AdminDashboardData,
  AdminDisputeDetail,
  AdminDisputeSummary,
  AdminMemberHistory,
  AdminMemberSummary,
  BoardDashboardData,
  CreditLedgerEntry,
  PeerCreditLoan,
  PeerDebtSummary,
  DefectRecord,
  Dispute,
  DisputeStatus,
  Loan,
  LateReturnFee,
  MaintenanceTicket,
  MediatorDecision,
  Member,
  MemberPayment,
  PayboxPayout,
  PayboxSettings,
  Reservation,
  Tool,
  ToolKindStats,
  ToolWithAvailability,
  Transaction,
  DevicePot,
  OperationsPot,
  Gemach,
  GemachPricingMode,
  GemachReservationMode,
  ToolKindWithAvailability,
  SafetyRule,
  AdminToolKindEdit,
} from "@/lib/types";
import {
  calculateLateFeeAmount,
  computeLateness,
  formatLateDuration,
} from "@/lib/late-fees";
import {
  isFirstPayout,
  splitFirstPayout,
  MEMBERSHIP_JOIN_MIN_NIS,
} from "@/lib/membership";
import {
  resolveKindId,
  groupToolsByKind,
  resolveKindUnits,
  pickAvailableUnit,
  pickAvailableUnits,
  buildToolKindWithAvailability,
  aggregateKindStatus,
} from "@/lib/tool-kinds";
import {
  PLATFORM_GEMACH_ID,
  PLATFORM_GEMACH_DISPLAY_NAME,
  normalizeGemachId,
  formatToolPriceLabel,
  isPartnerGemach,
  isPlatformGemach,
  resolveReservationFee,
  displayGemachName,
  resolveGemachReservationMode,
  resolveGemachDefaultLoanHours,
  resolveGemachMaxLoanHours,
  resolveToolDefaultLoanHours,
  resolveToolMaxLoanHours,
  validateToolLoanHours,
  PLATFORM_DEFAULT_LOAN_HOURS,
  PLATFORM_MAX_LOAN_HOURS,
  PARTNER_DEFAULT_LOAN_HOURS,
  PARTNER_MAX_LOAN_HOURS,
} from "@/lib/gemach";
import { splitPayment, getOperationsPercent } from "@/lib/pots";
import { getDefaultPayboxSettings } from "@/lib/paybox/config";
import {
  roleFromMemberData,
  DEFAULT_MEMBER_ROLE,
  gemachAdminIdsFromData,
} from "@/lib/admin";
import {
  formatAvailableFromLabel,
  reservationPickupDate,
  reservationReturnDate,
} from "@/lib/dates";
import {
  kindIdForTool,
  qrCodeForUnit,
  resolveToolFees,
  DEFAULT_SAFETY_RULES,
  validateToolInput,
} from "@/lib/tools-admin";
import { disputeProgressLabel, isDisputeOpen, pickRandomMediators } from "@/lib/disputes";
import { countUnitsAvailableInWindow } from "@/lib/availability";
import { isReservationNoShowExpired } from "@/lib/reservation-expiry";
import type { DefectCategory } from "@/lib/types";

function tsToIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function docWithId<T extends { id: string }>(
  id: string,
  data: DocumentData | undefined
): T | null {
  if (!data) return null;
  const { seededAt: _, createdAt, updatedAt, ...rest } = data;
  return {
    id,
    ...rest,
    ...(createdAt ? { createdAt: tsToIso(createdAt) } : {}),
    ...(updatedAt ? { updatedAt: tsToIso(updatedAt) } : {}),
  } as T;
}

function parseDefectRecord(value: unknown): DefectRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const d = value as Record<string, unknown>;
  const category = d.category as DefectCategory;
  if (
    category !== "broken" &&
    category !== "missing_part" &&
    category !== "wont_start" &&
    category !== "battery" &&
    category !== "other"
  ) {
    return undefined;
  }
  return {
    category,
    description: typeof d.description === "string" ? d.description : "",
    responsibility:
      d.responsibility === "member" ||
      d.responsibility === "gemach" ||
      d.responsibility === "unknown"
        ? d.responsibility
        : undefined,
    reportedAt:
      typeof d.reportedAt === "string" ? d.reportedAt : new Date().toISOString(),
  };
}

function newId(prefix: string) {
  // Timestamp keeps ids roughly sortable; the random suffix prevents
  // collisions when several ids are minted within the same millisecond
  // (e.g. the two ledger entries created for a peer credit transfer).
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function reservationToolIds(reservation: Reservation): string[] {
  if (reservation.toolIds?.length) return reservation.toolIds;
  return reservation.toolId ? [reservation.toolId] : [];
}

function reservationFromDoc(id: string, data: DocumentData): Reservation {
  return {
    id,
    memberId: (data.memberId as string) ?? "",
    toolId: (data.toolId as string) ?? "",
    pickupDate: reservationPickupDate(data),
    pickupTimeStart: typeof data.pickupTimeStart === "string" ? data.pickupTimeStart : undefined,
    pickupTimeEnd: typeof data.pickupTimeEnd === "string" ? data.pickupTimeEnd : undefined,
    returnDate: reservationReturnDate(data),
    returnTimeStart: typeof data.returnTimeStart === "string" ? data.returnTimeStart : undefined,
    returnTimeEnd: typeof data.returnTimeEnd === "string" ? data.returnTimeEnd : undefined,
    status: (data.status as Reservation["status"]) ?? "pending",
    feeAmount: (data.feeAmount as number) ?? 0,
    loanDurationHours:
      typeof data.loanDurationHours === "number" ? data.loanDurationHours : undefined,
    createdAt: data.createdAt ? tsToIso(data.createdAt) : new Date().toISOString(),
    kindId: typeof data.kindId === "string" ? data.kindId : undefined,
    quantity: typeof data.quantity === "number" ? data.quantity : undefined,
    toolIds: Array.isArray(data.toolIds)
      ? data.toolIds.filter((id): id is string => typeof id === "string")
      : undefined,
    groupId: typeof data.groupId === "string" ? data.groupId : undefined,
    cooperativeFeeAmount:
      typeof data.cooperativeFeeAmount === "number" ? data.cooperativeFeeAmount : undefined,
    cancelReason:
      data.cancelReason === "member" || data.cancelReason === "no_show"
        ? data.cancelReason
        : undefined,
    cancelledAt: data.cancelledAt ? tsToIso(data.cancelledAt) : undefined,
  };
}

function loanFromDoc(id: string, data: DocumentData): Loan {
  const loan = docWithId<Loan>(id, data)!;
  if (data.checkedOutAt) loan.checkedOutAt = tsToIso(data.checkedOutAt);
  if (data.returnedAt) loan.returnedAt = tsToIso(data.returnedAt);
  if (typeof data.dueReturnDate === "string") loan.dueReturnDate = data.dueReturnDate;
  if (typeof data.dueReturnTimeEnd === "string") loan.dueReturnTimeEnd = data.dueReturnTimeEnd;
  if (typeof data.groupId === "string") loan.groupId = data.groupId;
  if (Array.isArray(data.toolIds) && data.toolIds.length) {
    loan.toolIds = data.toolIds as string[];
  }
  if (typeof data.quantity === "number" && data.quantity > 0) {
    loan.quantity = data.quantity;
  }
  if (typeof data.disputeId === "string") loan.disputeId = data.disputeId;
  if (data.returnOk === true) loan.returnOk = true;
  loan.checkoutDefect = parseDefectRecord(data.checkoutDefect);
  loan.returnDefect = parseDefectRecord(data.returnDefect);
  return loan;
}

function buildActiveHolders(loans: Loan[], reservations: Reservation[]) {
  const activeLoans = loans.filter(
    (l) =>
      l.status === "active" ||
      l.status === "checkout_pending" ||
      l.status === "return_pending"
  );

  const activeReservations = reservations.filter(
    (r) => r.status === "pending" || r.status === "confirmed"
  );

  const loanPriority: Record<Loan["status"], number> = {
    active: 3,
    checkout_pending: 2,
    return_pending: 1,
    returned: 0,
    disputed: 0,
  };

  const loanByTool = new Map<string, Loan>();
  for (const loan of activeLoans) {
    const ids = loan.toolIds?.length ? loan.toolIds : loan.toolId ? [loan.toolId] : [];
    for (const toolId of ids) {
      const existing = loanByTool.get(toolId);
      if (!existing || loanPriority[loan.status] > loanPriority[existing.status]) {
        loanByTool.set(toolId, loan);
      }
    }
  }

  const reservationByTool = new Map<string, Reservation>();
  for (const reservation of activeReservations) {
    const ids = reservationToolIds(reservation);
    for (const toolId of ids) {
      const existing = reservationByTool.get(toolId);
      if (!existing || reservation.createdAt > existing.createdAt) {
        reservationByTool.set(toolId, reservation);
      }
    }
  }

  return { activeLoans, activeReservations, loanByTool, reservationByTool };
}

function availabilityForTool(
  tool: Tool,
  loanByTool: Map<string, Loan>,
  reservationByTool: Map<string, Reservation>
): Pick<ToolWithAvailability, "availableFrom" | "availabilityLabel"> {
  if (tool.status === "available") return {};

  let availableFrom: string | undefined;
  if (tool.status === "on_loan") {
    const loan = loanByTool.get(tool.id);
    availableFrom = loan?.dueReturnDate;
  } else if (tool.status === "reserved") {
    const reservation = reservationByTool.get(tool.id);
    availableFrom = reservation?.returnDate;
  }

  const availabilityLabel = availableFrom
    ? formatAvailableFromLabel(availableFrom)
    : undefined;

  return { availableFrom, availabilityLabel };
}

function toolFromDoc(id: string, data: DocumentData): Tool {
  const base = docWithId<Omit<Tool, "gemachId" | "kindId"> & { gemachId?: string; kindId?: string; unitLabel?: string }>(id, data)!;
  return {
    ...base,
    gemachId: normalizeGemachId(data.gemachId),
    kindId: resolveKindId(data, id),
    unitLabel: typeof data.unitLabel === "string" ? data.unitLabel : undefined,
    defaultLoanHours:
      typeof data.defaultLoanHours === "number" ? data.defaultLoanHours : undefined,
    maxLoanHours: typeof data.maxLoanHours === "number" ? data.maxLoanHours : undefined,
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
    adminNotes: typeof data.adminNotes === "string" ? data.adminNotes : undefined,
    location: typeof data.location === "string" ? data.location : undefined,
    brand: typeof data.brand === "string" ? data.brand : undefined,
    supplier: typeof data.supplier === "string" ? data.supplier : undefined,
    purpose: typeof data.purpose === "string" ? data.purpose : undefined,
    productAge: typeof data.productAge === "number" ? data.productAge : undefined,
    imageUrls: Array.isArray(data.imageUrls)
      ? data.imageUrls.filter((u): u is string => typeof u === "string")
      : undefined,
  };
}

function gemachFromDoc(id: string, data: DocumentData): Gemach {
  const isPlatform = (data.isPlatform as boolean) ?? false;
  return {
    id,
    name: (data.name as string) ?? id,
    slug: (data.slug as string) ?? id,
    description: (data.description as string) || undefined,
    pricingMode: (data.pricingMode as Gemach["pricingMode"]) ?? "loan_fee",
    maintenanceFee: (data.maintenanceFee as number) || undefined,
    payboxGroupUrl:
      typeof data.payboxGroupUrl === "string" && data.payboxGroupUrl
        ? data.payboxGroupUrl
        : undefined,
    isPlatform,
    active: (data.active as boolean) ?? true,
    reservationMode: (data.reservationMode as Gemach["reservationMode"]) ?? undefined,
    defaultLoanHours:
      typeof data.defaultLoanHours === "number" ? data.defaultLoanHours : undefined,
    maxLoanHours: typeof data.maxLoanHours === "number" ? data.maxLoanHours : undefined,
    closedAt: data.closedAt ? tsToIso(data.closedAt) : undefined,
    cooperativeFee:
      typeof data.cooperativeFee === "number" ? data.cooperativeFee : undefined,
    location: typeof data.location === "string" ? data.location : undefined,
  };
}

function gemachCatalogFields(gemach: Gemach, tool?: Tool) {
  return {
    gemachName: displayGemachName(gemach),
    gemachPricingMode: gemach.pricingMode,
    ...(tool ? { priceLabel: formatToolPriceLabel(gemach, tool) } : {}),
    isPartnerGemach: isPartnerGemach(gemach),
    gemachReservationMode: resolveGemachReservationMode(gemach),
    gemachDefaultLoanHours: tool
      ? resolveToolDefaultLoanHours(tool, gemach)
      : resolveGemachDefaultLoanHours(gemach),
    gemachMaxLoanHours: tool
      ? resolveToolMaxLoanHours(tool, gemach)
      : resolveGemachMaxLoanHours(gemach),
  };
}

function enrichToolsWithGemach(
  tools: Tool[],
  gemachMap: Map<string, Gemach>,
  extra?: Partial<ToolWithAvailability>
): ToolWithAvailability[] {
  return tools.map((tool) => {
    const gemach = gemachMap.get(tool.gemachId);
    if (!gemach) {
      return { ...tool, ...extra };
    }
    return {
      ...tool,
      ...extra,
      ...gemachCatalogFields(gemach, tool),
    };
  });
}

// ─── Gemachim ────────────────────────────────────────────────────────────────

export async function getAllGemachim(options?: {
  includeInactive?: boolean;
}): Promise<Gemach[]> {
  const snap = await getAdminDb().collection("gemachim").get();
  if (snap.empty) {
    return [
      {
        id: PLATFORM_GEMACH_ID,
        name: PLATFORM_GEMACH_DISPLAY_NAME,
        slug: "kerem",
        pricingMode: "loan_fee",
        isPlatform: true,
        active: true,
        reservationMode: "fixed_hours",
        defaultLoanHours: PLATFORM_DEFAULT_LOAN_HOURS,
        maxLoanHours: PLATFORM_MAX_LOAN_HOURS,
      },
    ];
  }
  const all = snap.docs.map((d) => gemachFromDoc(d.id, d.data()));
  return options?.includeInactive ? all : all.filter((g) => g.active);
}

export async function getGemachById(id: string): Promise<Gemach | null> {
  const snap = await getAdminDb().collection("gemachim").doc(id).get();
  if (!snap.exists) {
    if (id === PLATFORM_GEMACH_ID) {
      return {
        id: PLATFORM_GEMACH_ID,
        name: PLATFORM_GEMACH_DISPLAY_NAME,
        slug: "kerem",
        pricingMode: "loan_fee",
        isPlatform: true,
        active: true,
      };
    }
    return null;
  }
  return gemachFromDoc(snap.id, snap.data()!);
}

export async function createGemachAndAssignAdmin(params: {
  id: string;
  name: string;
  description?: string;
  pricingMode: Gemach["pricingMode"];
  reservationMode?: Gemach["reservationMode"];
  maintenanceFee?: number;
  payboxGroupUrl?: string;
  location?: string;
  cooperativeFee?: number;
  createdBy: string;
}): Promise<{ gemach: Gemach; member: Member }> {
  const db = getAdminDb();
  const gemachRef = db.collection("gemachim").doc(params.id);
  const memberRef = db.collection("members").doc(params.createdBy);

  const [existingGemach, memberSnap] = await Promise.all([
    gemachRef.get(),
    memberRef.get(),
  ]);

  if (existingGemach.exists) {
    throw new Error("מזהה גמ״ח כבר קיים — נסו מזהה אחר");
  }
  if (!memberSnap.exists) {
    throw new Error("משתמש לא נמצא");
  }

  const memberData = memberSnap.data()!;
  const role = roleFromMemberData(memberData);
  const gemachAdminIds = gemachAdminIdsFromData(memberData);

  const reservationMode = params.reservationMode ?? "date_range";

  const batch = db.batch();
  batch.set(gemachRef, {
    name: params.name.trim(),
    slug: params.id,
    description: params.description?.trim() || null,
    pricingMode: params.pricingMode,
    reservationMode,
    ...(reservationMode === "fixed_hours"
      ? {
          defaultLoanHours: PARTNER_DEFAULT_LOAN_HOURS,
          maxLoanHours: PARTNER_MAX_LOAN_HOURS,
        }
      : {}),
    ...(params.pricingMode === "maintenance_only" && params.maintenanceFee !== undefined
      ? { maintenanceFee: params.maintenanceFee }
      : {}),
    ...(params.payboxGroupUrl ? { payboxGroupUrl: params.payboxGroupUrl.trim() } : {}),
    ...(params.location?.trim() ? { location: params.location.trim() } : {}),
    ...(params.cooperativeFee !== undefined && params.cooperativeFee > 0
      ? { cooperativeFee: params.cooperativeFee }
      : {}),
    isPlatform: false,
    active: true,
    createdBy: params.createdBy,
    createdAt: FieldValue.serverTimestamp(),
  });

  const memberUpdates: Record<string, unknown> = {
    gemachAdminIds: gemachAdminIds.includes(params.id)
      ? gemachAdminIds
      : [...gemachAdminIds, params.id],
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (role === "MEMBER") {
    memberUpdates.role = "GEMACH_ADMIN";
  }
  batch.update(memberRef, memberUpdates);

  await batch.commit();

  const gemach = gemachFromDoc(params.id, (await gemachRef.get()).data()!);
  const member = memberFromDoc(params.createdBy, (await memberRef.get()).data()!);
  return { gemach, member };
}

export async function updateGemachSettings(params: {
  gemachId: string;
  payboxGroupUrl?: string | null;
  name?: string;
  description?: string;
  cooperativeFee?: number | null;
  location?: string | null;
  pricingMode?: GemachPricingMode;
  reservationMode?: GemachReservationMode;
  maintenanceFee?: number | null;
}): Promise<Gemach> {
  const ref = getAdminDb().collection("gemachim").doc(params.gemachId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("גמ״ח לא נמצא");
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (params.name !== undefined) {
    updates.name = params.name.trim();
  }
  if (params.description !== undefined) {
    updates.description = params.description.trim() || null;
  }
  if (params.payboxGroupUrl !== undefined) {
    updates.payboxGroupUrl = params.payboxGroupUrl?.trim() || null;
  }
  if (params.cooperativeFee === null) {
    updates.cooperativeFee = FieldValue.delete();
  } else if (params.cooperativeFee !== undefined) {
    updates.cooperativeFee = Math.max(0, params.cooperativeFee);
  }
  if (params.location === null) {
    updates.location = FieldValue.delete();
  } else if (params.location !== undefined) {
    updates.location = params.location.trim() || null;
  }
  if (params.pricingMode !== undefined) {
    updates.pricingMode = params.pricingMode;
    if (params.pricingMode === "free") {
      updates.maintenanceFee = FieldValue.delete();
    } else if (params.pricingMode === "loan_fee") {
      updates.cooperativeFee = FieldValue.delete();
      updates.maintenanceFee = FieldValue.delete();
    } else if (params.pricingMode === "maintenance_only") {
      updates.cooperativeFee = FieldValue.delete();
    }
  }
  if (params.reservationMode !== undefined) {
    updates.reservationMode = params.reservationMode;
  }
  if (params.maintenanceFee === null) {
    updates.maintenanceFee = FieldValue.delete();
  } else if (params.maintenanceFee !== undefined) {
    updates.maintenanceFee = Math.max(0, params.maintenanceFee);
  }

  await ref.update(updates);
  return gemachFromDoc(params.gemachId, (await ref.get()).data()!);
}

export async function closeGemachPermanently(gemachId: string): Promise<{
  deletedGemachId: string;
  deletedToolCount: number;
}> {
  const gemach = await getGemachById(gemachId);
  if (!gemach) {
    throw new Error("גמ״ח לא נמצא");
  }
  if (gemach.isPlatform || gemachId === PLATFORM_GEMACH_ID) {
    throw new Error("לא ניתן לסגור את קואופרטיב הפלטפורמה");
  }

  const tools = (await getAllTools()).filter((t) => t.gemachId === gemachId);
  const toolIds = new Set(tools.map((t) => t.id));

  const loans = await getAllLoans();
  const activeLoans = loans.filter(
    (l) =>
      toolIds.has(l.toolId) &&
      (l.status === "active" ||
        l.status === "checkout_pending" ||
        l.status === "return_pending")
  );
  if (activeLoans.length > 0) {
    throw new Error(
      `יש ${activeLoans.length} השאלות פעילות — יש להחזיר את הכלים לפני סגירת הגמ״ח`
    );
  }

  const db = getAdminDb();
  const reservations = await getAllReservations();
  const reservationsToCancel = reservations.filter(
    (r) =>
      toolIds.has(r.toolId) &&
      (r.status === "pending" || r.status === "confirmed")
  );

  const batch = db.batch();

  for (const reservation of reservationsToCancel) {
    batch.update(db.collection("reservations").doc(reservation.id), {
      status: "cancelled",
    });
  }

  for (const tool of tools) {
    batch.delete(db.collection("tools").doc(tool.id));
    batch.delete(db.collection("device_pots").doc(tool.id));
  }

  batch.delete(db.collection("gemachim").doc(gemachId));

  await batch.commit();

  for (const reservation of reservationsToCancel) {
    const pending = await getPendingPaymentForReservation(reservation.id);
    if (pending) {
      await db.collection("payments").doc(pending.id).update({ status: "failed" });
    }
  }

  const adminsSnap = await db
    .collection("members")
    .where("gemachAdminIds", "array-contains", gemachId)
    .get();

  for (const doc of adminsSnap.docs) {
    const member = memberFromDoc(doc.id, doc.data());
    const remainingIds = (member.gemachAdminIds ?? []).filter((id) => id !== gemachId);
    const updates: Record<string, unknown> = {
      gemachAdminIds: remainingIds,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (member.role !== "ADMIN" && remainingIds.length === 0) {
      updates.role = "MEMBER";
    }
    await db.collection("members").doc(doc.id).update(updates);
  }

  return { deletedGemachId: gemachId, deletedToolCount: tools.length };
}

export async function getToolKindForAdmin(
  gemachId: string,
  kindId: string
): Promise<AdminToolKindEdit | null> {
  const [tools, gemach] = await Promise.all([getAllTools(), getGemachById(gemachId)]);
  if (!gemach) return null;

  const units = tools.filter(
    (t) => t.gemachId === gemachId && (t.kindId ?? t.id) === kindId
  );
  if (units.length === 0) return null;

  const representative = units[0];
  return {
    kindId,
    gemachId,
    name: representative.name,
    description: representative.description,
    category: representative.category,
    loanFeeMin: representative.loanFeeMin,
    loanFeeMax: representative.loanFeeMax,
    totalUnits: units.length,
    pricingMode: gemach.pricingMode,
    reservationMode: resolveGemachReservationMode(gemach),
    defaultLoanHours: representative.defaultLoanHours,
    maxLoanHours: representative.maxLoanHours,
    gemachDefaultLoanHours: resolveGemachDefaultLoanHours(gemach),
    gemachMaxLoanHours: resolveGemachMaxLoanHours(gemach),
    imageUrl: representative.imageUrl,
    imageUrls: representative.imageUrls,
    location: representative.location,
    brand: representative.brand,
    supplier: representative.supplier,
    purpose: representative.purpose,
    productAge: representative.productAge,
    adminNotes: representative.adminNotes,
    safetyRules: representative.safetyRules,
    gemachLocation: gemach.location,
  };
}

export async function updateToolKindDetails(params: {
  gemachId: string;
  kindId: string;
  name: string;
  description: string;
  category: string;
  loanFeeMin?: number;
  loanFeeMax?: number;
  defaultLoanHours?: number | null;
  maxLoanHours?: number | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  location?: string | null;
  brand?: string | null;
  supplier?: string | null;
  purpose?: string | null;
  productAge?: number | null;
  adminNotes?: string | null;
  safetyRules?: SafetyRule[] | null;
}): Promise<{ updated: number }> {
  const gemach = await getGemachById(params.gemachId);
  if (!gemach) {
    throw new Error("גמ״ח לא נמצא");
  }

  const loanHoursError = validateToolLoanHours(
    params.defaultLoanHours === null ? undefined : params.defaultLoanHours,
    params.maxLoanHours === null ? undefined : params.maxLoanHours,
    gemach
  );
  if (loanHoursError) {
    throw new Error(loanHoursError);
  }

  const validationError = validateToolInput({
    name: params.name,
    description: params.description,
    category: params.category,
    quantity: 1,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const tools = await getAllTools();
  const units = tools.filter(
    (t) => t.gemachId === params.gemachId && (t.kindId ?? t.id) === params.kindId
  );
  if (units.length === 0) {
    throw new Error("הכלי לא נמצא");
  }

  const fees = resolveToolFees(
    gemach,
    params.loanFeeMin ?? units[0].loanFeeMin,
    params.loanFeeMax ?? params.loanFeeMin ?? units[0].loanFeeMax
  );

  const batch = getAdminDb().batch();
  for (const tool of units) {
    const update: Record<string, unknown> = {
      name: params.name.trim(),
      description: params.description.trim(),
      category: params.category.trim(),
      loanFeeMin: fees.loanFeeMin,
      loanFeeMax: fees.loanFeeMax,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (params.defaultLoanHours === null) {
      update.defaultLoanHours = FieldValue.delete();
    } else if (params.defaultLoanHours !== undefined) {
      update.defaultLoanHours = params.defaultLoanHours;
    }

    if (params.maxLoanHours === null) {
      update.maxLoanHours = FieldValue.delete();
    } else if (params.maxLoanHours !== undefined) {
      update.maxLoanHours = params.maxLoanHours;
    }

    if (params.imageUrl === null) {
      update.imageUrl = FieldValue.delete();
    } else if (params.imageUrl !== undefined) {
      update.imageUrl = params.imageUrl;
    }

    if (params.adminNotes === null) {
      update.adminNotes = FieldValue.delete();
    } else if (params.adminNotes !== undefined) {
      const notes = params.adminNotes.trim();
      update.adminNotes = notes ? notes : FieldValue.delete();
    }

    if (params.imageUrls === null) {
      update.imageUrls = FieldValue.delete();
    } else if (params.imageUrls !== undefined) {
      update.imageUrls = params.imageUrls.length ? params.imageUrls : FieldValue.delete();
    }

    // Explicit array (incl. empty) is saved; empty disables the safety step.
    if (params.safetyRules !== undefined) {
      update.safetyRules = params.safetyRules ?? [];
    }

    if (params.location === null) {
      update.location = FieldValue.delete();
    } else if (params.location !== undefined) {
      const loc = params.location.trim();
      update.location = loc ? loc : FieldValue.delete();
    }

    if (params.brand === null) {
      update.brand = FieldValue.delete();
    } else if (params.brand !== undefined) {
      const v = params.brand.trim();
      update.brand = v ? v : FieldValue.delete();
    }

    if (params.supplier === null) {
      update.supplier = FieldValue.delete();
    } else if (params.supplier !== undefined) {
      const v = params.supplier.trim();
      update.supplier = v ? v : FieldValue.delete();
    }

    if (params.purpose === null) {
      update.purpose = FieldValue.delete();
    } else if (params.purpose !== undefined) {
      const v = params.purpose.trim();
      update.purpose = v ? v : FieldValue.delete();
    }

    if (params.productAge === null) {
      update.productAge = FieldValue.delete();
    } else if (params.productAge !== undefined) {
      update.productAge = params.productAge;
    }

    batch.update(getAdminDb().collection("tools").doc(tool.id), update);
  }
  await batch.commit();
  return { updated: units.length };
}

export { resolveReservationFee };

// ─── Tools ───────────────────────────────────────────────────────────────────

export async function getAllTools(): Promise<Tool[]> {
  const snap = await getAdminDb().collection("tools").get();
  return snap.docs.map((d) => toolFromDoc(d.id, d.data())).filter(Boolean);
}

export async function getToolKindsWithAvailability(): Promise<ToolKindWithAvailability[]> {
  await expireStaleNoShowReservations();
  const [tools, loans, reservations, gemachim] = await Promise.all([
    getAllTools(),
    getAllLoans(),
    getAllReservations(),
    getAllGemachim(),
  ]);

  const gemachMap = new Map(gemachim.map((g) => [g.id, g]));
  const { loanByTool, reservationByTool } = buildActiveHolders(loans, reservations);
  const groups = groupToolsByKind(tools);

  return [...groups.values()]
    .filter((units) => gemachMap.has(units[0].gemachId))
    .map((units) => {
      const gemach = gemachMap.get(units[0].gemachId);
      return buildToolKindWithAvailability(units, loanByTool, reservationByTool, {
        ...(gemach ? gemachCatalogFields(gemach, units[0]) : {}),
        location: units[0].location ?? gemach?.location,
      });
    })
    .filter((k): k is ToolKindWithAvailability => k !== null);
}

export async function getToolKindWithAvailability(
  catalogKey: string
): Promise<ToolKindWithAvailability | null> {
  await expireStaleNoShowReservations();
  const [tools, loans, reservations] = await Promise.all([
    getAllTools(),
    getAllLoans(),
    getAllReservations(),
  ]);
  const units = resolveKindUnits(tools, catalogKey);
  if (units.length === 0) return null;

  const gemach = await getGemachById(units[0].gemachId);
  if (!gemach?.active) return null;
  const { loanByTool, reservationByTool } = buildActiveHolders(loans, reservations);

  return buildToolKindWithAvailability(units, loanByTool, reservationByTool, {
    ...(gemach ? gemachCatalogFields(gemach, units[0]) : {}),
    location: units[0].location ?? gemach?.location,
    stats: computeToolKindStats(units, loans),
  });
}

function computeToolKindStats(units: Tool[], loans: Loan[]): ToolKindStats {
  const unitIds = new Set(units.map((u) => u.id));
  const kindLoans = loans.filter(
    (l) =>
      unitIds.has(l.toolId) || (l.toolIds?.some((id) => unitIds.has(id)) ?? false)
  );
  const activeLoans = kindLoans.filter(
    (l) => l.status === "active" || l.status === "return_pending" || l.status === "checkout_pending"
  );
  const borrowers = new Set(kindLoans.map((l) => l.memberId));
  const unitsOf = (l: Loan) => l.quantity ?? l.toolIds?.length ?? 1;
  return {
    totalLoans: kindLoans.reduce((sum, l) => sum + unitsOf(l), 0),
    activeLoans: activeLoans.reduce((sum, l) => sum + unitsOf(l), 0),
    uniqueBorrowers: borrowers.size,
  };
}

export async function pickAvailableToolUnits(
  catalogKey: string,
  quantity: number
): Promise<Tool[]> {
  await expireStaleNoShowReservations();
  const tools = await getAllTools();
  const units = resolveKindUnits(tools, catalogKey);
  return pickAvailableUnits(units, quantity);
}

export async function pickAvailableToolUnit(catalogKey: string): Promise<Tool | null> {
  const picked = await pickAvailableToolUnits(catalogKey, 1);
  return picked[0] ?? null;
}

export async function getToolsWithAvailability(): Promise<ToolWithAvailability[]> {
  const [tools, loans, reservations, gemachim] = await Promise.all([
    getAllTools(),
    getAllLoans(),
    getAllReservations(),
    getAllGemachim(),
  ]);

  const gemachMap = new Map(gemachim.map((g) => [g.id, g]));
  const { loanByTool, reservationByTool } = buildActiveHolders(loans, reservations);

  return tools
    .filter((tool) => gemachMap.has(tool.gemachId))
    .map((tool) => {
    const gemach = gemachMap.get(tool.gemachId);
    return {
      ...tool,
      ...availabilityForTool(tool, loanByTool, reservationByTool),
      ...(gemach
        ? {
            gemachName: displayGemachName(gemach),
            gemachPricingMode: gemach.pricingMode,
            priceLabel: formatToolPriceLabel(gemach, tool),
            isPartnerGemach: isPartnerGemach(gemach),
          }
        : {}),
    };
  });
}

export async function getToolWithAvailability(id: string): Promise<ToolWithAvailability | null> {
  const tool = await getToolById(id);
  if (!tool) return null;

  const [loans, reservations, gemach] = await Promise.all([
    getAllLoans(),
    getAllReservations(),
    getGemachById(tool.gemachId),
  ]);
  const gemachMap = new Map(gemach ? [[gemach.id, gemach]] : []);
  const { loanByTool, reservationByTool } = buildActiveHolders(loans, reservations);

  const [enriched] = enrichToolsWithGemach([tool], gemachMap);
  return {
    ...enriched,
    ...availabilityForTool(tool, loanByTool, reservationByTool),
  };
}

export async function getToolById(id: string): Promise<Tool | null> {
  const snap = await getAdminDb().collection("tools").doc(id).get();
  if (!snap.exists) return null;
  return toolFromDoc(snap.id, snap.data()!);
}

export async function getToolByQrCode(qrCode: string): Promise<Tool | null> {
  const snap = await getAdminDb()
    .collection("tools")
    .where("qrCode", "==", qrCode)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return toolFromDoc(d.id, d.data()!);
}

export async function updateToolStatus(id: string, status: Tool["status"]) {
  await getAdminDb().collection("tools").doc(id).update({ status });
}

/** Bulk status change for all idle units of a tool kind. */
export async function updateToolKindStatus(params: {
  gemachId: string;
  kindId: string;
  status: "available" | "disabled" | "maintenance";
}): Promise<{ updated: number }> {
  const tools = await getAllTools();
  const units = tools.filter(
    (t) => t.gemachId === params.gemachId && (t.kindId ?? t.id) === params.kindId
  );
  if (units.length === 0) {
    throw new Error("הכלי לא נמצא");
  }

  const batch = getAdminDb().batch();
  let updated = 0;

  for (const tool of units) {
    let nextStatus: Tool["status"] | null = null;
    if (params.status === "available") {
      if (tool.status === "disabled" || tool.status === "maintenance") {
        nextStatus = "available";
      }
    } else if (params.status === "disabled" && tool.status === "available") {
      nextStatus = "disabled";
    } else if (params.status === "maintenance" && tool.status === "available") {
      nextStatus = "maintenance";
    }

    if (nextStatus) {
      batch.update(getAdminDb().collection("tools").doc(tool.id), { status: nextStatus });
      updated++;
    }
  }

  if (updated === 0) {
    throw new Error("אין יחידות שניתן לעדכן במצב הנוכחי");
  }

  await batch.commit();
  return { updated };
}

export async function updateToolStatusScoped(params: {
  toolId: string;
  status: Tool["status"];
  gemachId: string;
}): Promise<void> {
  const tool = await getToolById(params.toolId);
  if (!tool || tool.gemachId !== params.gemachId) {
    throw new Error("הכלי לא נמצא");
  }
  if (tool.status === "on_loan" || tool.status === "reserved") {
    throw new Error("לא ניתן לשנות סטטוס ליחידה מושאלת או שמורה");
  }
  if (params.status === "available" || params.status === "disabled" || params.status === "maintenance") {
    await updateToolStatus(params.toolId, params.status);
    return;
  }
  throw new Error("סטטוס לא נתמך");
}

export async function createToolsForGemach(params: {
  gemachId: string;
  name: string;
  description: string;
  category: string;
  quantity: number;
  loanFeeMin: number;
  loanFeeMax: number;
  kindId?: string;
  safetyRules?: SafetyRule[];
  defaultLoanHours?: number;
  maxLoanHours?: number;
  location?: string;
  brand?: string;
  supplier?: string;
  purpose?: string;
  productAge?: number;
  createdBy: string;
}): Promise<{ kindId: string; tools: Tool[] }> {
  const gemach = await getGemachById(params.gemachId);
  if (!gemach) {
    throw new Error("גמ״ח לא נמצא");
  }

  const loanHoursError = validateToolLoanHours(
    params.defaultLoanHours,
    params.maxLoanHours,
    gemach
  );
  if (loanHoursError) {
    throw new Error(loanHoursError);
  }

  const fees = resolveToolFees(gemach, params.loanFeeMin, params.loanFeeMax);
  const kindId = kindIdForTool(params.gemachId, params.name, params.kindId);
  // An explicit array (even empty) is respected; omitting it keeps the default.
  const safetyRules =
    params.safetyRules !== undefined ? params.safetyRules : DEFAULT_SAFETY_RULES;

  const db = getAdminDb();
  const batch = db.batch();
  const created: Tool[] = [];
  const baseId = Date.now().toString(36);

  for (let i = 0; i < params.quantity; i++) {
    const toolId = `tool-${baseId}-${i + 1}`;
    const unitLabel = params.quantity > 1 ? `יחידה ${i + 1}` : undefined;
    const qrCode = `${qrCodeForUnit(params.gemachId, kindId, i)}-${baseId.toUpperCase()}`;

    const toolData = {
      name: params.name.trim(),
      description: params.description.trim(),
      category: params.category.trim(),
      qrCode,
      status: "available" as const,
      loanFeeMin: fees.loanFeeMin,
      loanFeeMax: fees.loanFeeMax,
      gemachId: params.gemachId,
      kindId,
      ...(unitLabel ? { unitLabel } : {}),
      ...(params.defaultLoanHours !== undefined
        ? { defaultLoanHours: params.defaultLoanHours }
        : {}),
      ...(params.maxLoanHours !== undefined ? { maxLoanHours: params.maxLoanHours } : {}),
      ...(params.location?.trim() ? { location: params.location.trim() } : {}),
      ...(params.brand?.trim() ? { brand: params.brand.trim() } : {}),
      ...(params.supplier?.trim() ? { supplier: params.supplier.trim() } : {}),
      ...(params.purpose?.trim() ? { purpose: params.purpose.trim() } : {}),
      ...(params.productAge !== undefined && Number.isFinite(params.productAge)
        ? { productAge: params.productAge }
        : {}),
      safetyRules,
      createdBy: params.createdBy,
      createdAt: FieldValue.serverTimestamp(),
    };

    batch.set(db.collection("tools").doc(toolId), toolData);
    batch.set(
      db.collection("device_pots").doc(toolId),
      {
        toolId,
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
      },
      { merge: true }
    );

    created.push({
      id: toolId,
      name: params.name.trim(),
      description: params.description.trim(),
      category: params.category.trim(),
      qrCode,
      status: "available",
      loanFeeMin: fees.loanFeeMin,
      loanFeeMax: fees.loanFeeMax,
      gemachId: params.gemachId,
      kindId,
      ...(unitLabel ? { unitLabel } : {}),
      ...(params.defaultLoanHours !== undefined
        ? { defaultLoanHours: params.defaultLoanHours }
        : {}),
      ...(params.maxLoanHours !== undefined ? { maxLoanHours: params.maxLoanHours } : {}),
      ...(params.location?.trim() ? { location: params.location.trim() } : {}),
      ...(params.brand?.trim() ? { brand: params.brand.trim() } : {}),
      ...(params.supplier?.trim() ? { supplier: params.supplier.trim() } : {}),
      ...(params.purpose?.trim() ? { purpose: params.purpose.trim() } : {}),
      ...(params.productAge !== undefined && Number.isFinite(params.productAge)
        ? { productAge: params.productAge }
        : {}),
      safetyRules,
    });
  }

  await batch.commit();
  return { kindId, tools: created };
}

// ─── Reservations ──────────────────────────────────────────────────────────

export async function getReservationById(id: string): Promise<Reservation | null> {
  const snap = await getAdminDb().collection("reservations").doc(id).get();
  if (!snap.exists) return null;
  return reservationFromDoc(snap.id, snap.data()!);
}

export async function createReservation(
  data: Omit<Reservation, "id" | "createdAt">
): Promise<Reservation> {
  const id = newId("res");
  const ref = getAdminDb().collection("reservations").doc(id);
  const now = FieldValue.serverTimestamp();
  await ref.set({
    memberId: data.memberId,
    toolId: data.toolId,
    pickupDate: data.pickupDate,
    pickupTimeStart: data.pickupTimeStart ?? null,
    pickupTimeEnd: data.pickupTimeEnd ?? null,
    returnDate: data.returnDate,
    returnTimeStart: data.returnTimeStart ?? null,
    returnTimeEnd: data.returnTimeEnd ?? null,
    date: data.pickupDate,
    status: data.status,
    feeAmount: data.feeAmount,
    ...(data.loanDurationHours !== undefined
      ? { loanDurationHours: data.loanDurationHours }
      : {}),
    ...(data.kindId ? { kindId: data.kindId } : {}),
    ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
    ...(data.toolIds?.length ? { toolIds: data.toolIds } : {}),
    ...(data.groupId ? { groupId: data.groupId } : {}),
    ...(data.cooperativeFeeAmount !== undefined
      ? { cooperativeFeeAmount: data.cooperativeFeeAmount }
      : {}),
    createdAt: now,
  });
  return { ...data, id, createdAt: new Date().toISOString() };
}

export async function updateReservationStatus(id: string, status: Reservation["status"]) {
  await getAdminDb().collection("reservations").doc(id).update({ status });
}

async function releaseReservedToolsForReservation(
  db: FirebaseFirestore.Firestore,
  batch: FirebaseFirestore.WriteBatch,
  reservation: Reservation,
  reservationId: string
): Promise<void> {
  const toolIds = reservationToolIds(reservation);
  for (const toolId of toolIds) {
    const tool = await getToolById(toolId);
    if (tool?.status !== "reserved") continue;

    const onToolSnap = await db
      .collection("reservations")
      .where("toolId", "==", toolId)
      .get();

    let hasOtherActive = onToolSnap.docs.some((doc) => {
      if (doc.id === reservationId) return false;
      const status = doc.data().status as Reservation["status"];
      return status === "pending" || status === "confirmed";
    });

    if (!hasOtherActive) {
      const multiSnap = await db.collection("reservations").get();
      hasOtherActive = multiSnap.docs.some((doc) => {
        if (doc.id === reservationId) return false;
        const data = doc.data();
        const status = data.status as Reservation["status"];
        if (status !== "pending" && status !== "confirmed") return false;
        const ids = Array.isArray(data.toolIds)
          ? (data.toolIds as string[])
          : [data.toolId as string];
        return ids.includes(toolId);
      });
    }

    if (!hasOtherActive) {
      batch.update(db.collection("tools").doc(toolId), { status: "available" });
    }
  }
}

/** Cancel a reservation and free tools (no member auth — system no-show). */
export async function autoCancelNoShowReservation(
  reservationId: string
): Promise<Reservation | null> {
  const reservation = await getReservationById(reservationId);
  if (!reservation) return null;
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return reservation;
  }
  if (!isReservationNoShowExpired(reservation)) return reservation;

  const db = getAdminDb();
  const existingLoan = await db
    .collection("loans")
    .where("reservationId", "==", reservationId)
    .limit(1)
    .get();
  if (!existingLoan.empty) return reservation;

  const batch = db.batch();
  batch.update(db.collection("reservations").doc(reservationId), {
    status: "cancelled",
    cancelReason: "no_show",
    cancelledAt: FieldValue.serverTimestamp(),
  });

  await releaseReservedToolsForReservation(db, batch, reservation, reservationId);

  const pendingPayment = await getPendingPaymentForReservation(reservationId);
  if (pendingPayment) {
    batch.update(db.collection("payments").doc(pendingPayment.id), {
      status: "failed",
    });
  }

  await batch.commit();
  return { ...reservation, status: "cancelled" };
}

/** Cancel all active reservations past the no-show pickup deadline. */
export async function expireStaleNoShowReservations(): Promise<number> {
  const now = new Date();
  const reservations = await getAllReservations();
  const db = getAdminDb();
  const loanSnap = await db.collection("loans").get();
  const reservationIdsWithLoans = new Set(
    loanSnap.docs
      .map((d) => d.data().reservationId as string | undefined)
      .filter((id): id is string => Boolean(id))
  );

  const expired = reservations.filter(
    (r) =>
      isReservationNoShowExpired(r, now) && !reservationIdsWithLoans.has(r.id)
  );

  let count = 0;
  for (const r of expired) {
    const result = await autoCancelNoShowReservation(r.id);
    if (result?.status === "cancelled") count += 1;
  }
  return count;
}

export async function expireNoShowReservationIfNeeded(
  reservationId: string
): Promise<Reservation | null> {
  await autoCancelNoShowReservation(reservationId);
  return getReservationById(reservationId);
}

export async function cancelReservation(
  id: string,
  memberId: string
): Promise<Reservation> {
  const reservation = await getReservationById(id);
  if (!reservation) {
    throw new Error("השריון לא נמצא");
  }
  if (reservation.memberId !== memberId) {
    throw new Error("אין הרשאה לבטל שריון זה");
  }
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    throw new Error("לא ניתן לבטל שריון זה");
  }

  const db = getAdminDb();
  const existingLoan = await db
    .collection("loans")
    .where("reservationId", "==", id)
    .limit(1)
    .get();

  if (!existingLoan.empty) {
    throw new Error("כבר התחיל תהליך לקיחה — לא ניתן לבטל");
  }

  const batch = db.batch();
  batch.update(db.collection("reservations").doc(id), {
    status: "cancelled",
    cancelReason: "member",
    cancelledAt: FieldValue.serverTimestamp(),
  });

  await releaseReservedToolsForReservation(db, batch, reservation, id);

  const pendingPayment = await getPendingPaymentForReservation(id);
  if (pendingPayment) {
    batch.update(db.collection("payments").doc(pendingPayment.id), {
      status: "failed",
    });
  }

  await batch.commit();
  return { ...reservation, status: "cancelled" };
}

export async function getAllReservations(): Promise<Reservation[]> {
  const snap = await getAdminDb().collection("reservations").get();
  return snap.docs.map((d) => reservationFromDoc(d.id, d.data())).filter(Boolean);
}

export async function getReservationsByMember(memberId: string): Promise<Reservation[]> {
  await expireStaleNoShowReservations();
  const snap = await getAdminDb()
    .collection("reservations")
    .where("memberId", "==", memberId)
    .get();

  return snap.docs.map((d) => reservationFromDoc(d.id, d.data()));
}

// ─── Loans ─────────────────────────────────────────────────────────────────

export async function getLoanById(id: string): Promise<Loan | null> {
  const snap = await getAdminDb().collection("loans").doc(id).get();
  if (!snap.exists) return null;
  return loanFromDoc(snap.id, snap.data()!);
}

export async function getLoansByMember(memberId: string): Promise<Loan[]> {
  const snap = await getAdminDb()
    .collection("loans")
    .where("memberId", "==", memberId)
    .get();
  return snap.docs.map((d) => loanFromDoc(d.id, d.data())).filter(Boolean);
}

export async function getAllLoans(): Promise<Loan[]> {
  const snap = await getAdminDb().collection("loans").get();
  return snap.docs.map((d) => loanFromDoc(d.id, d.data())).filter(Boolean);
}

// ─── Members ───────────────────────────────────────────────────────────────

function memberCreditBalance(data: DocumentData): number {
  const value = data.creditBalance;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function memberFromDoc(id: string, data: DocumentData): Member {
  return {
    id,
    name: (data.name as string) ?? "חבר",
    firstName: (data.firstName as string) || undefined,
    familyName: (data.familyName as string) || undefined,
    nameCompleted: data.nameCompleted === true,
    email: (data.email as string) ?? "",
    phone: (data.phone as string) || undefined,
    isAmember: (data.isAmember as boolean) ?? false,
    firstPayout: data.firstPayout !== false,
    termsAcceptedAt: (data.termsAcceptedAt as string) || undefined,
    membershipOfferDismissedAt:
      (data.membershipOfferDismissedAt as string) || undefined,
    hasPaymentMethod: (data.hasPaymentMethod as boolean) ?? false,
    role: roleFromMemberData(data),
    gemachAdminIds: gemachAdminIdsFromData(data),
    creditBalance: memberCreditBalance(data),
  };
}

/** Full admin summary projection for a member document. */
function memberSummaryFromDoc(id: string, data: DocumentData): AdminMemberSummary {
  const m = memberFromDoc(id, data);
  return {
    id: m.id,
    name: m.name,
    firstName: m.firstName,
    familyName: m.familyName,
    email: m.email,
    phone: m.phone,
    isAmember: m.isAmember,
    firstPayout: m.firstPayout,
    role: m.role,
    gemachAdminIds: m.gemachAdminIds,
    creditBalance: m.creditBalance,
  };
}

export async function getMemberById(uid: string): Promise<Member | null> {
  const snap = await getAdminDb().collection("members").doc(uid).get();
  if (!snap.exists) return null;
  return memberFromDoc(snap.id, snap.data()!);
}

export async function syncMemberFromAuth(params: {
  uid: string;
  name: string;
  email: string;
  photoURL?: string | null;
}): Promise<Member> {
  const ref = getAdminDb().collection("members").doc(params.uid);
  const existing = await ref.get();
  const existingData = existing.exists ? existing.data() : undefined;
  const role = existing.exists
    ? roleFromMemberData(existingData ?? {})
    : DEFAULT_MEMBER_ROLE;

  await ref.set(
    {
      name: params.name,
      email: params.email,
      photoURL: params.photoURL ?? null,
      hasPaymentMethod: existing.exists
        ? ((existingData?.hasPaymentMethod as boolean) ?? false)
        : false,
      role,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists
        ? {}
        : {
            createdAt: FieldValue.serverTimestamp(),
            isAmember: false,
            firstPayout: true,
          }),
    },
    { merge: true }
  );

  return {
    id: params.uid,
    name: params.name,
    firstName: (existingData?.firstName as string) || undefined,
    familyName: (existingData?.familyName as string) || undefined,
    nameCompleted: existingData?.nameCompleted === true,
    email: params.email,
    phone: (existingData?.phone as string) || undefined,
    isAmember: (existingData?.isAmember as boolean) ?? false,
    firstPayout: existingData?.firstPayout !== false,
    termsAcceptedAt: (existingData?.termsAcceptedAt as string) || undefined,
    membershipOfferDismissedAt:
      (existingData?.membershipOfferDismissedAt as string) || undefined,
    hasPaymentMethod: existing.exists
      ? ((existingData?.hasPaymentMethod as boolean) ?? false)
      : false,
    role,
    gemachAdminIds: existing.exists ? gemachAdminIdsFromData(existingData ?? {}) : [],
    creditBalance: existing.exists ? memberCreditBalance(existingData ?? {}) : 0,
  };
}

/** Update platform-admin-managed member flags (membership / first payout). */
export async function updateMemberFlags(
  memberId: string,
  updates: { isAmember?: boolean; firstPayout?: boolean }
): Promise<AdminMemberSummary> {
  const ref = getAdminDb().collection("members").doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("משתמש לא נמצא");

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof updates.isAmember === "boolean") patch.isAmember = updates.isAmember;
  if (typeof updates.firstPayout === "boolean") patch.firstPayout = updates.firstPayout;

  await ref.set(patch, { merge: true });
  return memberSummaryFromDoc(memberId, (await ref.get()).data()!);
}

/** Save a member's mobile number (stored as digits only). */
export async function updateMemberPhone(uid: string, phone: string): Promise<Member> {
  const ref = getAdminDb().collection("members").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("משתמש לא נמצא");

  await ref.set(
    { phone, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const snap = await ref.get();
  return memberFromDoc(snap.id, snap.data()!);
}

/** Record תקנון acceptance (idempotent). */
export async function acceptMemberTerms(uid: string): Promise<Member> {
  const ref = getAdminDb().collection("members").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("משתמש לא נמצא");

  const data = existing.data()!;
  if (typeof data.termsAcceptedAt === "string" && data.termsAcceptedAt) {
    return memberFromDoc(existing.id, data);
  }

  const termsAcceptedAt = new Date().toISOString();
  await ref.set(
    { termsAcceptedAt, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const snap = await ref.get();
  return memberFromDoc(snap.id, snap.data()!);
}

/** Dismiss the optional post-signup join offer (PayBox + תקנון). */
export async function dismissMembershipOffer(uid: string): Promise<Member> {
  const ref = getAdminDb().collection("members").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("משתמש לא נמצא");

  const data = existing.data()!;
  if (
    typeof data.membershipOfferDismissedAt === "string" &&
    data.membershipOfferDismissedAt
  ) {
    return memberFromDoc(existing.id, data);
  }

  const membershipOfferDismissedAt = new Date().toISOString();
  await ref.set(
    { membershipOfferDismissedAt, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  const snap = await ref.get();
  return memberFromDoc(snap.id, snap.data()!);
}

/** Save a member's first and family name (both required). */
export async function updateMemberName(
  uid: string,
  firstName: string,
  familyName: string
): Promise<Member> {
  const ref = getAdminDb().collection("members").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) throw new Error("משתמש לא נמצא");

  await ref.set(
    {
      firstName,
      familyName,
      name: `${firstName} ${familyName}`,
      nameCompleted: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const snap = await ref.get();
  return memberFromDoc(snap.id, snap.data()!);
}

export async function getAdminDashboard(options?: {
  gemachId?: string;
  includeGemachim?: boolean;
}): Promise<AdminDashboardData> {
  const gemachId = options?.gemachId;
  const lateFeeGemachFilter =
    gemachId ?? (options?.includeGemachim ? PLATFORM_GEMACH_ID : undefined);
  const [allTools, loans, reservations, gemachim, scopedGemach, openTickets, unpaidLateFees] =
    await Promise.all([
    getAllTools(),
    getAllLoans(),
    getAllReservations(),
    options?.includeGemachim ? getAllGemachim({ includeInactive: true }) : Promise.resolve([]),
    gemachId ? getGemachById(gemachId) : Promise.resolve(null),
    listMaintenanceTickets({ status: "open" }),
    listLateReturnFees({ paid: false, gemachId: lateFeeGemachFilter }),
  ]);

  const tools = gemachId
    ? allTools.filter((t) => t.gemachId === gemachId)
    : allTools;
  const toolIds = new Set(tools.map((t) => t.id));
  const gemachMap = new Map(gemachim.map((g) => [g.id, g]));

  const { activeLoans, activeReservations, loanByTool, reservationByTool } =
    buildActiveHolders(
      loans.filter((l) => toolIds.has(l.toolId)),
      reservations.filter((r) => toolIds.has(r.toolId))
    );

  const memberIds = [
    ...new Set([
      ...activeLoans.map((l) => l.memberId),
      ...activeReservations.map((r) => r.memberId),
      ...openTickets.map((t) => t.memberId),
      ...unpaidLateFees.map((f) => f.memberId),
    ]),
  ];
  const members = await Promise.all(memberIds.map((id) => getMemberById(id)));
  const memberMap = new Map(
    members.filter(Boolean).map((m) => [m!.id, m!])
  );

  const toolRows = [...groupToolsByKind(tools).entries()].map(([, units]) => {
    const representative = units[0];
    const kindId = representative.kindId ?? representative.id;

    const unitRows = units.map((tool) => {
      const loan = loanByTool.get(tool.id);
      const reservation = loan ? undefined : reservationByTool.get(tool.id);
      const holderId = loan?.memberId ?? reservation?.memberId;
      const member = holderId ? memberMap.get(holderId) : undefined;
      return {
        id: tool.id,
        unitLabel: tool.unitLabel,
        status: tool.status,
        borrowerName: member?.name ?? (holderId ? "לא ידוע" : undefined),
        borrowerEmail: member?.email,
        holderKind: loan ? ("loan" as const) : reservation ? ("reservation" as const) : undefined,
      };
    });

    return {
      kindId,
      name: representative.name,
      category: representative.category,
      gemachId: representative.gemachId,
      gemachName: (() => {
        const g = gemachMap.get(representative.gemachId);
        return g ? displayGemachName(g) : undefined;
      })(),
      status: aggregateKindStatus(units),
      totalUnits: units.length,
      availableUnits: units.filter((t) => t.status === "available").length,
      onLoanUnits: units.filter((t) => t.status === "on_loan").length,
      reservedUnits: units.filter((t) => t.status === "reserved").length,
      disabledUnits: units.filter((t) => t.status === "disabled").length,
      maintenanceUnits: units.filter((t) => t.status === "maintenance").length,
      units: unitRows,
    };
  });

  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const allToolMap = new Map(allTools.map((t) => [t.id, t]));

  const problemReportGemachFilter =
    gemachId ?? (options?.includeGemachim ? PLATFORM_GEMACH_ID : undefined);

  const problemReports = openTickets
    .map((ticket) => {
      const tool = allToolMap.get(ticket.toolId);
      if (!tool) return null;
      if (problemReportGemachFilter && tool.gemachId !== problemReportGemachFilter) return null;
      const member = memberMap.get(ticket.memberId);
      const gemach = gemachMap.get(tool.gemachId);
      return {
        id: ticket.id,
        toolId: ticket.toolId,
        toolName: tool.name,
        gemachId: tool.gemachId,
        gemachName: gemach ? displayGemachName(gemach) : undefined,
        memberId: ticket.memberId,
        memberName: member?.name ?? "לא ידוע",
        memberEmail: member?.email ?? "",
        loanId: ticket.loanId,
        description: ticket.description,
        status: ticket.status,
        adminReply: ticket.adminReply,
        createdAt: ticket.createdAt,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const lateReturnFees = unpaidLateFees.map((fee) => {
    const tool = allToolMap.get(fee.toolId);
    const member = memberMap.get(fee.memberId);
    const gemach = gemachMap.get(fee.gemachId);
    return {
      id: fee.id,
      loanId: fee.loanId,
      memberId: fee.memberId,
      memberName: member?.name ?? "לא ידוע",
      memberEmail: member?.email ?? "",
      toolId: fee.toolId,
      toolName: tool?.name ?? fee.toolId,
      gemachId: fee.gemachId,
      gemachName: gemach ? displayGemachName(gemach) : undefined,
      dueAt: fee.dueAt,
      returnedAt: fee.returnedAt,
      lateMinutes: fee.lateMinutes,
      lateDurationLabel: formatLateDuration(fee.lateMinutes),
      amount: fee.amount,
      paid: fee.paid,
      paidAt: fee.paidAt,
      createdAt: fee.createdAt,
    };
  });

  return {
    stats: {
      totalTools: tools.length,
      available: tools.filter((t) => t.status === "available").length,
      onLoan: tools.filter((t) => t.status === "on_loan").length,
      reserved: tools.filter((t) => t.status === "reserved").length,
      maintenance: tools.filter((t) => t.status === "maintenance").length,
      disabled: tools.filter((t) => t.status === "disabled").length,
      activeLoans: activeLoans.length,
      activeReservations: activeReservations.length,
      openProblemReports: problemReports.length,
      unpaidLateFees: lateReturnFees.length,
    },
    tools: toolRows.sort((a, b) => a.name.localeCompare(b.name, "he")),
    activeReservations: activeReservations.map((reservation) => {
      const member = memberMap.get(reservation.memberId);
      const tool = toolMap.get(reservation.toolId);
      return {
        id: reservation.id,
        toolId: reservation.toolId,
        toolName: tool?.name ?? reservation.toolId,
        memberId: reservation.memberId,
        memberName: member?.name ?? "לא ידוע",
        memberEmail: member?.email ?? "",
        status: reservation.status,
        pickupDate: reservation.pickupDate,
        returnDate: reservation.returnDate,
        createdAt: reservation.createdAt,
        quantity: reservation.quantity ?? reservation.toolIds?.length ?? 1,
      };
    }),
    activeLoans: activeLoans.map((loan) => {
      const member = memberMap.get(loan.memberId);
      const tool = toolMap.get(loan.toolId);
      return {
        id: loan.id,
        toolId: loan.toolId,
        toolName: tool?.name ?? loan.toolId,
        memberId: loan.memberId,
        memberName: member?.name ?? "לא ידוע",
        memberEmail: member?.email ?? "",
        status: loan.status,
        checkedOutAt: loan.checkedOutAt,
        dueReturnDate: loan.dueReturnDate,
        checkoutPhotoUrl: loan.checkoutPhotoUrl,
        returnPhotoUrl: loan.returnPhotoUrl,
        quantity: loan.quantity ?? loan.toolIds?.length ?? 1,
        ...(loan.groupId ? { groupId: loan.groupId } : {}),
      };
    }),
    problemReports,
    lateReturnFees,
    ...(scopedGemach ? { gemach: scopedGemach } : {}),
    ...(options?.includeGemachim ? { gemachim } : {}),
  };
}

export async function listMembers(query?: string): Promise<AdminMemberSummary[]> {
  const snap = await getAdminDb().collection("members").get();
  const normalized = query?.trim().toLowerCase() ?? "";

  return snap.docs
    .map((d) => memberFromDoc(d.id, d.data()))
    .filter((m) => {
      if (!normalized) return true;
      return (
        m.email.toLowerCase().includes(normalized) ||
        m.name.toLowerCase().includes(normalized)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "he"))
    .map((m) => ({
      id: m.id,
      name: m.name,
      firstName: m.firstName,
      familyName: m.familyName,
      email: m.email,
      phone: m.phone,
      isAmember: m.isAmember,
      firstPayout: m.firstPayout,
      role: m.role,
      gemachAdminIds: m.gemachAdminIds,
      creditBalance: m.creditBalance,
    }));
}

/** @deprecated use listMembers */
export async function searchMembersByEmail(query: string): Promise<AdminMemberSummary[]> {
  return listMembers(query);
}

export async function getMemberHistory(memberId: string): Promise<AdminMemberHistory | null> {
  const member = await getMemberById(memberId);
  if (!member) return null;

  const [loans, reservations, allTools] = await Promise.all([
    getLoansByMember(memberId),
    getReservationsByMember(memberId),
    getAllTools(),
  ]);
  const toolMap = new Map(allTools.map((t) => [t.id, t]));

  const sortedLoans = [...loans].sort(
    (a, b) => (b.checkedOutAt ?? "").localeCompare(a.checkedOutAt ?? "")
  );
  const sortedReservations = [...reservations].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );

  const creditLedger = await getMemberCreditLedger(memberId);

  return {
    member: {
      id: member.id,
      name: member.name,
      firstName: member.firstName,
      familyName: member.familyName,
      email: member.email,
      phone: member.phone,
      isAmember: member.isAmember,
      firstPayout: member.firstPayout,
      role: member.role,
      gemachAdminIds: member.gemachAdminIds,
      creditBalance: member.creditBalance,
    },
    creditLedger,
    loans: sortedLoans.map((loan) => ({
      id: loan.id,
      toolId: loan.toolId,
      toolName: toolMap.get(loan.toolId)?.name ?? loan.toolId,
      status: loan.status,
      checkedOutAt: loan.checkedOutAt,
      dueReturnDate: loan.dueReturnDate,
      returnedAt: loan.returnedAt,
      checkoutPhotoUrl: loan.checkoutPhotoUrl,
      returnPhotoUrl: loan.returnPhotoUrl,
      additionalPhotoCount: loan.additionalPhotoUrls?.length ?? 0,
    })),
    reservations: sortedReservations.map((reservation) => ({
      id: reservation.id,
      toolId: reservation.toolId,
      toolName: toolMap.get(reservation.toolId)?.name ?? reservation.toolId,
      status: reservation.status,
      pickupDate: reservation.pickupDate,
      returnDate: reservation.returnDate,
      createdAt: reservation.createdAt,
    })),
  };
}

export async function updateMemberRole(
  memberId: string,
  role: Member["role"]
): Promise<AdminMemberSummary> {
  if (role !== "ADMIN" && role !== "MEMBER" && role !== "GEMACH_ADMIN") {
    throw new Error("תפקיד לא נתמך");
  }

  const ref = getAdminDb().collection("members").doc(memberId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("משתמש לא נמצא");
  }

  await ref.update({
    role,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return memberSummaryFromDoc(memberId, (await ref.get()).data()!);
}

// ─── Internal credit balance ─────────────────────────────────────────────────

function creditLedgerFromDoc(id: string, data: DocumentData): CreditLedgerEntry {
  return {
    id,
    memberId: (data.memberId as string) ?? "",
    delta: typeof data.delta === "number" ? data.delta : 0,
    balanceAfter: typeof data.balanceAfter === "number" ? data.balanceAfter : 0,
    reason: (data.reason as CreditLedgerEntry["reason"]) ?? "manual_adjustment",
    note: typeof data.note === "string" ? data.note : undefined,
    reservationId: typeof data.reservationId === "string" ? data.reservationId : undefined,
    peerLoanId: typeof data.peerLoanId === "string" ? data.peerLoanId : undefined,
    createdBy: (data.createdBy as string) ?? "",
    createdAt: data.createdAt ? tsToIso(data.createdAt) : new Date().toISOString(),
  };
}

export async function getMemberCreditLedger(
  memberId: string,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  const snap = await getAdminDb()
    .collection("credit_ledger")
    .where("memberId", "==", memberId)
    .get();

  return snap.docs
    .map((d) => creditLedgerFromDoc(d.id, d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Apply a manual balance adjustment (platform admin only). Runs in a
 * transaction so concurrent edits cannot corrupt the balance, and records
 * every change in the credit ledger. Balance may not drop below zero.
 */
export async function adjustMemberCredit(params: {
  memberId: string;
  delta: number;
  reason: CreditLedgerEntry["reason"];
  note?: string;
  createdBy: string;
}): Promise<{ balance: number; entry: CreditLedgerEntry }> {
  const { memberId, delta, reason, note, createdBy } = params;
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("סכום העדכון אינו תקין");
  }

  const db = getAdminDb();
  const memberRef = db.collection("members").doc(memberId);
  const ledgerRef = db.collection("credit_ledger").doc(newId("cl"));

  const balanceAfter = await db.runTransaction(async (txn) => {
    const snap = await txn.get(memberRef);
    if (!snap.exists) throw new Error("משתמש לא נמצא");

    const data = snap.data() ?? {};
    // Balance can only be added to paying members. A non-member must join first.
    if (delta > 0 && data.isAmember !== true) {
      throw new Error("לא ניתן להוסיף יתרה למי שאינו רשום כחבר משלם בקואופרטיב");
    }

    const current = memberCreditBalance(data);
    const next = Math.round((current + delta) * 100) / 100;
    if (next < 0) {
      throw new Error("היתרה אינה יכולה לרדת מתחת לאפס");
    }

    txn.set(
      memberRef,
      { creditBalance: next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    txn.set(
      ledgerRef,
      omitUndefined({
        id: ledgerRef.id,
        memberId,
        delta,
        balanceAfter: next,
        reason,
        note,
        createdBy,
        createdAt: FieldValue.serverTimestamp(),
      })
    );

    return next;
  });

  const entry = creditLedgerFromDoc(
    ledgerRef.id,
    (await ledgerRef.get()).data() ?? {}
  );
  return { balance: balanceAfter, entry };
}

/**
 * Credit a single PayBox payment row to a member's balance. Idempotent per
 * `importKey`: the whole operation (dedupe check, balance update, ledger entry
 * and import record) runs in one transaction, so re-uploading the same export
 * never double-credits. Returns "duplicate" when the row was already imported.
 */
export async function applyPayboxImportRow(params: {
  memberId: string;
  amount: number;
  importKey: string;
  note?: string;
  createdBy: string;
}): Promise<
  | { status: "duplicate" }
  | { status: "rejected_not_member" }
  | {
      status: "applied";
      balance: number;
      entry: CreditLedgerEntry;
      credited: number;
      membershipFee: number;
      becameMember: boolean;
    }
> {
  const { memberId, amount, importKey, note, createdBy } = params;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("סכום התשלום אינו תקין");
  }

  const db = getAdminDb();
  const memberRef = db.collection("members").doc(memberId);
  const importRef = db.collection("paybox_payment_imports").doc(importKey);
  const ledgerRef = db.collection("credit_ledger").doc(newId("cl"));

  const result = await db.runTransaction(async (txn) => {
    const importSnap = await txn.get(importRef);
    if (importSnap.exists) return { status: "duplicate" as const };

    const snap = await txn.get(memberRef);
    if (!snap.exists) throw new Error("משתמש לא נמצא");

    const data = snap.data() ?? {};
    const isAmember = data.isAmember === true;

    // A non-member can only be credited by a qualifying membership payment
    // (>= the join minimum). Anything smaller is rejected — no credit applied.
    if (!isAmember && amount < MEMBERSHIP_JOIN_MIN_NIS) {
      return { status: "rejected_not_member" as const };
    }

    // A qualifying non-member becomes a member now. Only on that first join do
    // we withhold the one-time membership fee and credit the remainder; every
    // later payment from an existing member is credited in full.
    const firstPayout = isFirstPayout(data);
    const becameMember = !isAmember;
    const { membershipFee, credited } = splitFirstPayout(
      amount,
      becameMember && firstPayout
    );

    const current = memberCreditBalance(data);
    const next = Math.round((current + credited) * 100) / 100;

    const feeNote =
      membershipFee > 0
        ? `${note ? `${note} · ` : ""}דמי חבר נוכו ₪${membershipFee} מתוך ₪${amount}`
        : note;

    txn.set(
      memberRef,
      omitUndefined({
        creditBalance: next,
        ...(firstPayout ? { firstPayout: false } : {}),
        ...(becameMember ? { isAmember: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );
    txn.set(
      ledgerRef,
      omitUndefined({
        id: ledgerRef.id,
        memberId,
        delta: credited,
        balanceAfter: next,
        reason: "paybox_import" as CreditLedgerEntry["reason"],
        note: feeNote,
        createdBy,
        createdAt: FieldValue.serverTimestamp(),
      })
    );
    txn.set(
      importRef,
      omitUndefined({
        id: importKey,
        memberId,
        amount,
        credited,
        membershipFee,
        ledgerId: ledgerRef.id,
        note: feeNote,
        createdBy,
        createdAt: FieldValue.serverTimestamp(),
      })
    );
    return {
      status: "applied" as const,
      balance: next,
      credited,
      membershipFee,
      becameMember,
    };
  });

  if (result.status === "duplicate") return { status: "duplicate" };
  if (result.status === "rejected_not_member") return { status: "rejected_not_member" };

  const entry = creditLedgerFromDoc(
    ledgerRef.id,
    (await ledgerRef.get()).data() ?? {}
  );
  return {
    status: "applied",
    balance: result.balance,
    entry,
    credited: result.credited,
    membershipFee: result.membershipFee,
    becameMember: result.becameMember,
  };
}

/**
 * Apply the member's internal balance toward a reservation's loan fee.
 * Debits up to the available balance (partial allowed), records a ledger
 * entry, and updates/creates the reservation payment. Idempotent: a payment
 * that already has credit applied is returned unchanged.
 */
export async function applyCreditToReservationPayment(params: {
  reservation: Reservation;
  memberId: string;
}): Promise<{
  payment: MemberPayment;
  creditApplied: number;
  remaining: number;
  paid: boolean;
}> {
  const { reservation, memberId } = params;
  const fee = reservation.feeAmount;

  const existingPaid = await getPaidPaymentForReservation(reservation.id);
  if (existingPaid) {
    return {
      payment: existingPaid,
      creditApplied: existingPaid.creditApplied ?? 0,
      remaining: 0,
      paid: true,
    };
  }

  const db = getAdminDb();
  const memberRef = db.collection("members").doc(memberId);
  const pending = await getPendingPaymentForReservation(reservation.id);
  const paymentId = pending?.id ?? newId("pay");
  const paymentRef = db.collection("payments").doc(paymentId);
  const ledgerRef = db.collection("credit_ledger").doc(newId("cl"));

  await db.runTransaction(async (txn) => {
    const memberSnap = await txn.get(memberRef);
    const balance = memberCreditBalance(memberSnap.data() ?? {});
    const paySnap = await txn.get(paymentRef);
    const alreadyApplied =
      paySnap.exists && typeof paySnap.data()?.creditApplied === "number"
        ? (paySnap.data()!.creditApplied as number)
        : 0;

    if (alreadyApplied > 0) {
      return; // idempotent — credit already applied to this payment
    }

    const creditApply = Math.min(balance, fee);
    if (creditApply <= 0) {
      throw new Error("אין יתרה זמינה לשימוש");
    }

    const balanceAfter = Math.round((balance - creditApply) * 100) / 100;
    const remaining = Math.max(0, Math.round((fee - creditApply) * 100) / 100);
    const paid = remaining <= 0;

    txn.set(
      memberRef,
      { creditBalance: balanceAfter, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    txn.set(ledgerRef, {
      id: ledgerRef.id,
      memberId,
      delta: -creditApply,
      balanceAfter,
      reason: "payment_debit",
      note: `תשלום מהיתרה — השאלה ${reservation.id}`,
      reservationId: reservation.id,
      createdBy: memberId,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (paySnap.exists) {
      txn.update(
        paymentRef,
        omitUndefined({
          creditApplied: creditApply,
          ...(paid
            ? {
                status: "paid",
                provider: "credit",
                paidAt: FieldValue.serverTimestamp(),
              }
            : {}),
        })
      );
    } else {
      txn.set(paymentRef, {
        id: paymentId,
        reservationId: reservation.id,
        memberId,
        toolId: reservation.toolId,
        amount: fee,
        creditApplied: creditApply,
        status: paid ? "paid" : "pending",
        provider: paid ? "credit" : "paybox_group",
        payboxGroupUrl: "",
        createdAt: FieldValue.serverTimestamp(),
        ...(paid ? { paidAt: FieldValue.serverTimestamp() } : {}),
      });
    }
  });

  const payment = await getPaymentById(paymentId);
  if (!payment) throw new Error("התשלום לא נמצא");
  const creditApplied = payment.creditApplied ?? 0;
  const remaining = Math.max(0, Math.round((fee - creditApplied) * 100) / 100);
  return { payment, creditApplied, remaining, paid: remaining <= 0 };
}

// ─── Peer credit loans (mutual guarantee) ───────────────────────────────────

function peerLoanFromDoc(id: string, data: DocumentData): PeerCreditLoan {
  return {
    id,
    lenderId: data.lenderId as string,
    lenderName: (data.lenderName as string) ?? "",
    borrowerId: data.borrowerId as string,
    borrowerName: (data.borrowerName as string) ?? "",
    principal: typeof data.principal === "number" ? data.principal : 0,
    outstanding: typeof data.outstanding === "number" ? data.outstanding : 0,
    status: data.status === "settled" ? "settled" : "open",
    createdAt: data.createdAt ? tsToIso(data.createdAt) : new Date().toISOString(),
    settledAt: data.settledAt ? tsToIso(data.settledAt) : undefined,
  };
}

/** Members a borrower can receive credit from / send credit to (id + name only). */
export async function listMemberDirectory(
  excludeId?: string
): Promise<Array<{ id: string; name: string }>> {
  const snap = await getAdminDb().collection("members").get();
  return snap.docs
    .map((d) => ({ id: d.id, name: (d.data().name as string) ?? "חבר/ה" }))
    .filter((m) => m.id !== excludeId)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

/** Open debts a member owes (as borrower) and is owed (as lender), aggregated. */
export async function getPeerCreditSummary(memberId: string): Promise<{
  owed: PeerDebtSummary[];
  lent: PeerDebtSummary[];
}> {
  const db = getAdminDb();
  const [owedSnap, lentSnap] = await Promise.all([
    db
      .collection("credit_loans")
      .where("borrowerId", "==", memberId)
      .where("status", "==", "open")
      .get(),
    db
      .collection("credit_loans")
      .where("lenderId", "==", memberId)
      .where("status", "==", "open")
      .get(),
  ]);

  const aggregate = (
    loans: PeerCreditLoan[],
    counterparty: "lender" | "borrower"
  ): PeerDebtSummary[] => {
    const map = new Map<string, PeerDebtSummary>();
    for (const loan of loans) {
      if (loan.outstanding <= 0) continue;
      const id = counterparty === "lender" ? loan.lenderId : loan.borrowerId;
      const name = counterparty === "lender" ? loan.lenderName : loan.borrowerName;
      const existing = map.get(id);
      if (existing) existing.total = Math.round((existing.total + loan.outstanding) * 100) / 100;
      else map.set(id, { counterpartyId: id, counterpartyName: name, total: loan.outstanding });
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  };

  return {
    owed: aggregate(
      owedSnap.docs.map((d) => peerLoanFromDoc(d.id, d.data())),
      "lender"
    ),
    lent: aggregate(
      lentSnap.docs.map((d) => peerLoanFromDoc(d.id, d.data())),
      "borrower"
    ),
  };
}

/**
 * Transfer internal credit from one member to another and record the debt.
 * The recipient owes the sender back. Atomic: balances, ledger entries and the
 * loan record all move together.
 */
export async function transferCreditToMember(params: {
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}): Promise<{ loan: PeerCreditLoan }> {
  const { fromMemberId, toMemberId } = params;
  const amount = Math.round(params.amount * 100) / 100;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("סכום ההעברה אינו תקין");
  }
  if (fromMemberId === toMemberId) {
    throw new Error("לא ניתן להעביר קרדיט לעצמכם");
  }

  const db = getAdminDb();
  const fromRef = db.collection("members").doc(fromMemberId);
  const toRef = db.collection("members").doc(toMemberId);
  const loanRef = db.collection("credit_loans").doc(newId("cloan"));
  const fromLedgerRef = db.collection("credit_ledger").doc(newId("cl"));
  const toLedgerRef = db.collection("credit_ledger").doc(newId("cl"));

  await db.runTransaction(async (txn) => {
    const [fromSnap, toSnap] = await Promise.all([txn.get(fromRef), txn.get(toRef)]);
    if (!fromSnap.exists) throw new Error("החשבון שלך לא נמצא");
    if (!toSnap.exists) throw new Error("המשתמש שאליו מעבירים לא נמצא");

    const fromData = fromSnap.data() ?? {};
    const toData = toSnap.data() ?? {};
    const fromBalance = memberCreditBalance(fromData);
    const toBalance = memberCreditBalance(toData);

    if (fromBalance < amount) {
      throw new Error("אין מספיק יתרה להעברה");
    }

    const fromName = (fromData.name as string) ?? "חבר/ה";
    const toName = (toData.name as string) ?? "חבר/ה";
    const fromAfter = Math.round((fromBalance - amount) * 100) / 100;
    const toAfter = Math.round((toBalance + amount) * 100) / 100;

    txn.set(fromRef, { creditBalance: fromAfter, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    txn.set(toRef, { creditBalance: toAfter, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    txn.set(loanRef, {
      id: loanRef.id,
      lenderId: fromMemberId,
      lenderName: fromName,
      borrowerId: toMemberId,
      borrowerName: toName,
      principal: amount,
      outstanding: amount,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
    });

    txn.set(fromLedgerRef, {
      id: fromLedgerRef.id,
      memberId: fromMemberId,
      delta: -amount,
      balanceAfter: fromAfter,
      reason: "peer_transfer_out",
      note: `העברת קרדיט לחבר ${toName}`,
      peerLoanId: loanRef.id,
      createdBy: fromMemberId,
      createdAt: FieldValue.serverTimestamp(),
    });
    txn.set(toLedgerRef, {
      id: toLedgerRef.id,
      memberId: toMemberId,
      delta: amount,
      balanceAfter: toAfter,
      reason: "peer_transfer_in",
      note: `קבלת קרדיט מחבר ${fromName}`,
      peerLoanId: loanRef.id,
      createdBy: fromMemberId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  const loanSnap = await loanRef.get();
  return { loan: peerLoanFromDoc(loanRef.id, loanSnap.data() ?? {}) };
}

/**
 * Repay, in full, every open debt the borrower owes to one counterparty
 * (lender). Moves credit back and settles the loans atomically.
 */
export async function repayPeerCreditDebt(params: {
  borrowerId: string;
  lenderId: string;
}): Promise<{ repaid: number }> {
  const { borrowerId, lenderId } = params;
  if (borrowerId === lenderId) throw new Error("בקשה לא תקינה");

  const db = getAdminDb();
  const borrowerRef = db.collection("members").doc(borrowerId);
  const lenderRef = db.collection("members").doc(lenderId);
  const openLoansQuery = db
    .collection("credit_loans")
    .where("borrowerId", "==", borrowerId)
    .where("lenderId", "==", lenderId)
    .where("status", "==", "open");
  const borrowerLedgerRef = db.collection("credit_ledger").doc(newId("cl"));
  const lenderLedgerRef = db.collection("credit_ledger").doc(newId("cl"));

  const repaid = await db.runTransaction(async (txn) => {
    const loansSnap = await txn.get(openLoansQuery);
    const total = loansSnap.docs.reduce((sum, d) => {
      const o = d.data().outstanding;
      return sum + (typeof o === "number" ? o : 0);
    }, 0);
    const totalRounded = Math.round(total * 100) / 100;
    if (totalRounded <= 0) throw new Error("אין חוב פתוח להחזרה");

    const [borrowerSnap, lenderSnap] = await Promise.all([
      txn.get(borrowerRef),
      txn.get(lenderRef),
    ]);
    if (!borrowerSnap.exists) throw new Error("החשבון שלך לא נמצא");
    if (!lenderSnap.exists) throw new Error("המלווה לא נמצא");

    const borrowerBalance = memberCreditBalance(borrowerSnap.data() ?? {});
    const lenderBalance = memberCreditBalance(lenderSnap.data() ?? {});
    if (borrowerBalance < totalRounded) {
      throw new Error(
        "אין מספיק יתרה להחזרת החוב המלא — המתינו שהמנהל יטעין את היתרה"
      );
    }

    const lenderName = (lenderSnap.data()?.name as string) ?? "חבר/ה";
    const borrowerName = (borrowerSnap.data()?.name as string) ?? "חבר/ה";
    const borrowerAfter = Math.round((borrowerBalance - totalRounded) * 100) / 100;
    const lenderAfter = Math.round((lenderBalance + totalRounded) * 100) / 100;

    txn.set(borrowerRef, { creditBalance: borrowerAfter, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    txn.set(lenderRef, { creditBalance: lenderAfter, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    for (const doc of loansSnap.docs) {
      txn.update(doc.ref, {
        outstanding: 0,
        status: "settled",
        settledAt: FieldValue.serverTimestamp(),
      });
    }

    txn.set(borrowerLedgerRef, {
      id: borrowerLedgerRef.id,
      memberId: borrowerId,
      delta: -totalRounded,
      balanceAfter: borrowerAfter,
      reason: "peer_repay_out",
      note: `החזר חוב לחבר ${lenderName}`,
      createdBy: borrowerId,
      createdAt: FieldValue.serverTimestamp(),
    });
    txn.set(lenderLedgerRef, {
      id: lenderLedgerRef.id,
      memberId: lenderId,
      delta: totalRounded,
      balanceAfter: lenderAfter,
      reason: "peer_repay_in",
      note: `קבלת החזר מחבר ${borrowerName}`,
      createdBy: borrowerId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return totalRounded;
  });

  return { repaid };
}

export async function getPotsOverviewForGemach(gemachId: string) {
  const { tools, devicePots, operationsPot, operationsPercent } =
    await getPotsOverview();
  const scopedTools = tools.filter((t) => t.gemachId === gemachId);
  const toolIds = new Set(scopedTools.map((t) => t.id));
  const scopedPots = devicePots.filter((p) => toolIds.has(p.toolId ?? p.id));
  return {
    tools: scopedTools,
    devicePots: scopedPots,
    operationsPot,
    operationsPercent,
  };
}

export async function createLoanFromCheckout(params: {
  reservation: Reservation;
  checkoutPhotoUrl: string;
  checkoutConditionNotes?: string;
  checkoutItemsChecked?: string[];
  checkoutDefect?: DefectRecord;
  loanId?: string;
}): Promise<{ loan: Loan; loans: Loan[] }> {
  const payment =
    params.reservation.feeAmount > 0
      ? await getPaidPaymentForReservation(params.reservation.id)
      : null;
  if (params.reservation.feeAmount > 0 && !payment) {
    throw new Error("Payment required before checkout");
  }

  const db = getAdminDb();
  const split = splitPayment(params.reservation.feeAmount);
  const toolIds = reservationToolIds(params.reservation);
  const quantity = toolIds.length;
  const perUnitDevice = quantity > 0 ? split.deviceAmount / quantity : 0;
  const loanId = params.loanId ?? newId("loan");
  const txnId = newId("txn");

  const transaction: Transaction = {
    id: txnId,
    memberId: params.reservation.memberId,
    toolId: toolIds[0],
    loanId,
    amount: split.totalAmount,
    operationsAmount: split.operationsAmount,
    deviceAmount: split.deviceAmount,
    createdAt: new Date().toISOString(),
  };

  // One loan document represents the whole booking; quantity / toolIds capture
  // the individual physical units that were taken out together.
  const loan: Loan = {
    id: loanId,
    reservationId: params.reservation.id,
    memberId: params.reservation.memberId,
    toolId: toolIds[0],
    toolIds,
    quantity,
    status: "active",
    safetyAcknowledged: true,
    checkoutPhotoUrl: params.checkoutPhotoUrl,
    checkoutConditionNotes: params.checkoutConditionNotes?.trim() || undefined,
    checkoutItemsChecked: params.checkoutItemsChecked?.length
      ? params.checkoutItemsChecked
      : undefined,
    checkoutDefect: params.checkoutDefect,
    checkedOutAt: new Date().toISOString(),
    dueReturnDate: params.reservation.returnDate || undefined,
    dueReturnTimeEnd:
      params.reservation.returnTimeEnd ?? params.reservation.returnTimeStart,
  };

  const batch = db.batch();
  batch.set(db.collection("loans").doc(loanId), {
    ...omitUndefined(loan as unknown as Record<string, unknown>),
    checkedOutAt: FieldValue.serverTimestamp(),
  });

  for (const toolId of toolIds) {
    batch.update(db.collection("tools").doc(toolId), { status: "on_loan" });
    batch.set(
      db.collection("device_pots").doc(toolId),
      {
        toolId,
        balance: FieldValue.increment(perUnitDevice),
        totalEarned: FieldValue.increment(perUnitDevice),
        totalSpent: 0,
      },
      { merge: true }
    );
  }

  batch.set(db.collection("transactions").doc(txnId), {
    ...transaction,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("reservations").doc(params.reservation.id), {
    status: "completed",
  });
  batch.set(
    db.collection("operations_pot").doc("main"),
    {
      balance: FieldValue.increment(split.operationsAmount),
      totalEarned: FieldValue.increment(split.operationsAmount),
      totalSpent: 0,
    },
    { merge: true }
  );

  await batch.commit();
  return { loan, loans: [loan] };
}

export async function completeLoanReturn(
  loanId: string,
  params: {
    returnPhotoUrl: string;
    returnConditionNotes?: string;
    returnItemsChecked?: string[];
    returnOk?: boolean;
    returnDefect?: DefectRecord;
  }
): Promise<{ loan: Loan; lateFee: LateReturnFee | null; dispute?: Dispute }> {
  const db = getAdminDb();
  const loan = await getLoanById(loanId);
  if (!loan) throw new Error("Loan not found");

  const hasDefect = Boolean(params.returnDefect);
  const loanStatus: Loan["status"] = hasDefect ? "disputed" : "returned";
  const toolStatus: Tool["status"] = hasDefect ? "maintenance" : "available";

  const returnedAt = new Date();
  const returnedAtIso = returnedAt.toISOString();
  const batch = db.batch();

  batch.update(db.collection("loans").doc(loanId), {
    status: loanStatus,
    returnPhotoUrl: params.returnPhotoUrl,
    returnConditionNotes: params.returnConditionNotes?.trim() || null,
    returnItemsChecked: params.returnItemsChecked?.length ? params.returnItemsChecked : null,
    returnOk: params.returnOk === true ? true : null,
    returnDefect: params.returnDefect ?? null,
    returnedAt: FieldValue.serverTimestamp(),
  });
  const loanToolIds = loan.toolIds?.length ? loan.toolIds : [loan.toolId];
  for (const toolId of loanToolIds) {
    batch.update(db.collection("tools").doc(toolId), { status: toolStatus });
  }

  let lateFee: LateReturnFee | null = null;
  let dispute: Dispute | undefined;
  const reservation = loan.reservationId
    ? await getReservationById(loan.reservationId)
    : null;

  if (reservation) {
    const { lateMinutes, dueAt } = computeLateness(reservation, returnedAt);
    const amount = calculateLateFeeAmount(lateMinutes);
    if (lateMinutes > 0 && amount > 0 && !hasDefect) {
      const tool = await getToolById(loan.toolId);
      const feeId = newId("late");
      lateFee = {
        id: feeId,
        loanId,
        reservationId: loan.reservationId,
        memberId: loan.memberId,
        toolId: loan.toolId,
        gemachId: tool?.gemachId ?? PLATFORM_GEMACH_ID,
        dueAt: dueAt.toISOString(),
        returnedAt: returnedAtIso,
        lateMinutes,
        amount,
        paid: false,
        createdAt: returnedAtIso,
      };
      batch.set(db.collection("late_return_fees").doc(feeId), {
        ...lateFee,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  if (hasDefect && params.returnDefect) {
    const tool = await getToolById(loan.toolId);
  const members = await listMembers();
    dispute = buildDisputeForBatch({
      loanId,
      toolId: loan.toolId,
      memberId: loan.memberId,
      gemachId: tool?.gemachId ?? PLATFORM_GEMACH_ID,
      defect: params.returnDefect,
      members,
      batch,
    });
    batch.update(db.collection("loans").doc(loanId), { disputeId: dispute.id });
  }

  await batch.commit();

  return {
    loan: {
      ...loan,
      status: loanStatus,
      returnPhotoUrl: params.returnPhotoUrl,
      returnConditionNotes: params.returnConditionNotes?.trim() || undefined,
      returnItemsChecked: params.returnItemsChecked,
      returnOk: params.returnOk,
      returnDefect: params.returnDefect,
      returnedAt: returnedAtIso,
      disputeId: dispute?.id,
    },
    lateFee,
    dispute,
  };
}

export async function addLoanPhoto(loanId: string, photoUrl: string): Promise<Loan> {
  const loan = await getLoanById(loanId);
  if (!loan) throw new Error("Loan not found");
  if (loan.status !== "active") {
    throw new Error("ניתן להוסיף צילום רק להשאלה פעילה");
  }

  const additionalPhotoUrls = [...(loan.additionalPhotoUrls ?? []), photoUrl];
  await getAdminDb()
    .collection("loans")
    .doc(loanId)
    .update({ additionalPhotoUrls });

  return { ...loan, additionalPhotoUrls };
}

// ─── Late return fees ───────────────────────────────────────────────────────

function lateReturnFeeFromDoc(id: string, data: DocumentData): LateReturnFee {
  return {
    id,
    loanId: data.loanId as string,
    reservationId: data.reservationId as string,
    memberId: data.memberId as string,
    toolId: data.toolId as string,
    gemachId: (data.gemachId as string) ?? PLATFORM_GEMACH_ID,
    dueAt: typeof data.dueAt === "string" ? data.dueAt : tsToIso(data.dueAt),
    returnedAt:
      typeof data.returnedAt === "string" ? data.returnedAt : tsToIso(data.returnedAt),
    lateMinutes: (data.lateMinutes as number) ?? 0,
    amount: (data.amount as number) ?? 0,
    paid: (data.paid as boolean) ?? false,
    paidAt: data.paidAt ? tsToIso(data.paidAt) : undefined,
    markedPaidBy: (data.markedPaidBy as string) || undefined,
    createdAt: data.createdAt ? tsToIso(data.createdAt) : new Date().toISOString(),
  };
}

export async function listLateReturnFees(options?: {
  paid?: boolean;
  gemachId?: string;
}): Promise<LateReturnFee[]> {
  const snap = await getAdminDb().collection("late_return_fees").get();
  return snap.docs
    .map((d) => lateReturnFeeFromDoc(d.id, d.data()))
    .filter((fee) => {
      if (options?.paid !== undefined && fee.paid !== options.paid) return false;
      if (options?.gemachId && fee.gemachId !== options.gemachId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markLateReturnFeePaid(
  feeId: string,
  markedPaidBy: string
): Promise<LateReturnFee> {
  const ref = getAdminDb().collection("late_return_fees").doc(feeId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("רשומת קנס לא נמצאה");

  await ref.update({
    paid: true,
    paidAt: FieldValue.serverTimestamp(),
    markedPaidBy,
  });

  const data = snap.data()!;
  return {
    ...lateReturnFeeFromDoc(feeId, data),
    paid: true,
    paidAt: new Date().toISOString(),
    markedPaidBy,
  };
}

// ─── Maintenance ───────────────────────────────────────────────────────────

export async function createMaintenanceTicket(
  data: Omit<MaintenanceTicket, "id" | "createdAt" | "status">
): Promise<MaintenanceTicket> {
  const id = newId("ticket");
  const db = getAdminDb();
  const batch = db.batch();

  batch.set(db.collection("maintenance_tickets").doc(id), {
    ...omitUndefined(data as unknown as Record<string, unknown>),
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("tools").doc(data.toolId), { status: "disabled" });

  await batch.commit();
  return { ...data, id, status: "open", createdAt: new Date().toISOString() };
}

function maintenanceTicketFromDoc(id: string, data: DocumentData): MaintenanceTicket {
  return {
    id,
    toolId: data.toolId as string,
    loanId: (data.loanId as string) || undefined,
    memberId: data.memberId as string,
    description: data.description as string,
    status: (data.status as MaintenanceTicket["status"]) ?? "open",
    adminReply: (data.adminReply as string) || undefined,
    resolvedAt: data.resolvedAt ? tsToIso(data.resolvedAt) : undefined,
    resolvedBy: (data.resolvedBy as string) || undefined,
    createdAt: tsToIso(data.createdAt),
  };
}

export async function resolveMaintenanceTicket(
  ticketId: string,
  params: { adminReply?: string; resolvedBy: string }
): Promise<MaintenanceTicket> {
  const db = getAdminDb();
  const ref = db.collection("maintenance_tickets").doc(ticketId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("הדיווח לא נמצא");

  const data = snap.data()!;
  if (data.status === "resolved") throw new Error("הדיווח כבר נסגר");

  const batch = db.batch();
  batch.update(ref, {
    status: "resolved",
    adminReply: params.adminReply?.trim() || null,
    resolvedAt: FieldValue.serverTimestamp(),
    resolvedBy: params.resolvedBy,
  });

  const toolRef = db.collection("tools").doc(data.toolId as string);
  const toolSnap = await toolRef.get();
  if (toolSnap.exists && toolSnap.data()?.status === "disabled") {
    batch.update(toolRef, { status: "available" });
  }

  await batch.commit();

  return {
    ...maintenanceTicketFromDoc(ticketId, data),
    status: "resolved",
    adminReply: params.adminReply?.trim() || undefined,
    resolvedAt: new Date().toISOString(),
    resolvedBy: params.resolvedBy,
  };
}

export async function listMaintenanceTickets(options?: {
  status?: MaintenanceTicket["status"] | MaintenanceTicket["status"][];
}): Promise<MaintenanceTicket[]> {
  const snap = await getAdminDb().collection("maintenance_tickets").get();
  const statuses = options?.status
    ? Array.isArray(options.status)
      ? options.status
      : [options.status]
    : null;

  return snap.docs
    .map((d) => maintenanceTicketFromDoc(d.id, d.data()))
    .filter((t) => !statuses || statuses.includes(t.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMaintenanceTicketById(id: string): Promise<MaintenanceTicket | null> {
  const snap = await getAdminDb().collection("maintenance_tickets").doc(id).get();
  if (!snap.exists) return null;
  return maintenanceTicketFromDoc(snap.id, snap.data()!);
}

// ─── Pots ──────────────────────────────────────────────────────────────────

export async function getDevicePots(): Promise<(DevicePot & { id: string })[]> {
  const snap = await getAdminDb().collection("device_pots").get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<DevicePot, "toolId">),
    toolId: d.data().toolId ?? d.id,
  }));
}

export async function getOperationsPot(): Promise<OperationsPot> {
  const snap = await getAdminDb().collection("operations_pot").doc("main").get();
  if (!snap.exists) {
    return { balance: 0, totalEarned: 0, totalSpent: 0 };
  }
  const data = snap.data()!;
  return {
    balance: data.balance ?? 0,
    totalEarned: data.totalEarned ?? 0,
    totalSpent: data.totalSpent ?? 0,
  };
}

export async function getPotsOverview() {
  const [tools, devicePots, operationsPot] = await Promise.all([
    getAllTools(),
    getDevicePots(),
    getOperationsPot(),
  ]);
  const operationsPercent = getOperationsPercent();
  return { tools, devicePots, operationsPot, operationsPercent };
}

// ─── PayBox settings ─────────────────────────────────────────────────────────

export async function getPayboxSettings(): Promise<PayboxSettings> {
  const snap = await getAdminDb().collection("settings").doc("paybox").get();
  if (!snap.exists) return getDefaultPayboxSettings();

  const data = snap.data()!;
  const defaults = getDefaultPayboxSettings();
  return {
    enabled: (data.enabled as boolean) ?? defaults.enabled,
    operationsGroupUrl:
      (data.operationsGroupUrl as string) || defaults.operationsGroupUrl,
    deviceGroupUrl: (data.deviceGroupUrl as string) || defaults.deviceGroupUrl,
    groupName: (data.groupName as string) || undefined,
    growPageCode: (data.growPageCode as string) || defaults.growPageCode,
  };
}

// ─── Member payments (PayBox group) ──────────────────────────────────────────

export async function getPaymentById(id: string): Promise<MemberPayment | null> {
  const snap = await getAdminDb().collection("payments").doc(id).get();
  if (!snap.exists) return null;
  const payment = docWithId<MemberPayment>(snap.id, snap.data());
  if (payment && snap.data()?.createdAt) {
    payment.createdAt = tsToIso(snap.data()!.createdAt);
  }
  if (payment && snap.data()?.paidAt) {
    payment.paidAt = tsToIso(snap.data()!.paidAt);
  }
  return payment;
}

export async function getPendingPaymentForReservation(
  reservationId: string
): Promise<MemberPayment | null> {
  const snap = await getAdminDb()
    .collection("payments")
    .where("reservationId", "==", reservationId)
    .limit(5)
    .get();

  const pendingDoc = snap.docs.find((d) => d.data().status === "pending");
  if (!pendingDoc) return null;

  const payment = docWithId<MemberPayment>(pendingDoc.id, pendingDoc.data());
  if (payment && pendingDoc.data()?.createdAt) {
    payment.createdAt = tsToIso(pendingDoc.data()!.createdAt);
  }
  return payment;
}

export async function getPaidPaymentForReservation(
  reservationId: string
): Promise<MemberPayment | null> {
  const snap = await getAdminDb()
    .collection("payments")
    .where("reservationId", "==", reservationId)
    .limit(5)
    .get();

  const paidDoc = snap.docs.find((d) => d.data().status === "paid");
  if (!paidDoc) return null;

  const payment = docWithId<MemberPayment>(paidDoc.id, paidDoc.data());
  if (payment && paidDoc.data()?.createdAt) {
    payment.createdAt = tsToIso(paidDoc.data()!.createdAt);
  }
  if (payment && paidDoc.data()?.paidAt) {
    payment.paidAt = tsToIso(paidDoc.data()!.paidAt);
  }
  return payment;
}

export async function createMemberPayment(params: {
  reservation: Reservation;
  payboxGroupUrl: string;
  growPaymentUrl?: string;
  provider: MemberPayment["provider"];
}): Promise<MemberPayment> {
  const id = newId("pay");
  const payment: MemberPayment = {
    id,
    reservationId: params.reservation.id,
    memberId: params.reservation.memberId,
    toolId: params.reservation.toolId,
    amount: params.reservation.feeAmount,
    status: "pending",
    provider: params.provider,
    payboxGroupUrl: params.payboxGroupUrl,
    growPaymentUrl: params.growPaymentUrl,
    createdAt: new Date().toISOString(),
  };

  await getAdminDb()
    .collection("payments")
    .doc(id)
    .set({
      id,
      reservationId: payment.reservationId,
      memberId: payment.memberId,
      toolId: payment.toolId,
      amount: payment.amount,
      status: payment.status,
      provider: payment.provider,
      payboxGroupUrl: payment.payboxGroupUrl,
      ...(payment.growPaymentUrl ? { growPaymentUrl: payment.growPaymentUrl } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });

  return payment;
}

export async function markPaymentPaid(paymentId: string): Promise<MemberPayment> {
  const payment = await getPaymentById(paymentId);
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "paid") return payment;

  await getAdminDb().collection("payments").doc(paymentId).update({
    status: "paid",
    paidAt: FieldValue.serverTimestamp(),
  });

  return {
    ...payment,
    status: "paid",
    paidAt: new Date().toISOString(),
  };
}

// ─── PayBox payouts (admin → group) ──────────────────────────────────────────

export async function getPayboxPayouts(limit = 20): Promise<PayboxPayout[]> {
  const snap = await getAdminDb().collection("paybox_payouts").limit(limit).get();

  const payouts = snap.docs.map((d) => {
    const payout = docWithId<PayboxPayout>(d.id, d.data())!;
    if (d.data()?.createdAt) payout.createdAt = tsToIso(d.data()!.createdAt);
    if (d.data()?.completedAt) payout.completedAt = tsToIso(d.data()!.completedAt);
    return payout;
  });

  return payouts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function createPayboxPayout(params: {
  potTarget: PayboxPayout["potTarget"];
  toolId?: string;
  amount: number;
  groupUrl: string;
  note?: string;
  createdBy: string;
}): Promise<PayboxPayout> {
  if (params.amount <= 0) throw new Error("Invalid payout amount");

  const db = getAdminDb();
  if (params.potTarget === "operations") {
    const pot = await getOperationsPot();
    if (pot.balance < params.amount) throw new Error("Insufficient operations pot balance");
  } else {
    if (!params.toolId) throw new Error("Device pot requires toolId");
    const potSnap = await db.collection("device_pots").doc(params.toolId).get();
    const balance = (potSnap.data()?.balance as number) ?? 0;
    if (balance < params.amount) throw new Error("Insufficient device pot balance");
  }

  const id = newId("payout");
  const payout: PayboxPayout = {
    id,
    potTarget: params.potTarget,
    toolId: params.toolId,
    amount: params.amount,
    groupUrl: params.groupUrl,
    status: "pending",
    note: params.note,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };

  await db.collection("paybox_payouts").doc(id).set({
    ...payout,
    createdAt: FieldValue.serverTimestamp(),
  });

  return payout;
}

export async function completePayboxPayout(payoutId: string): Promise<PayboxPayout> {
  const db = getAdminDb();
  const ref = db.collection("paybox_payouts").doc(payoutId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Payout not found");

  const data = snap.data()!;
  if (data.status === "completed") {
    return docWithId<PayboxPayout>(snap.id, data)!;
  }
  if (data.status === "cancelled") {
    throw new Error("Payout was cancelled");
  }

  const amount = data.amount as number;
  const potTarget = data.potTarget as PayboxPayout["potTarget"];
  const toolId = data.toolId as string | undefined;

  const batch = db.batch();
  batch.update(ref, {
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });

  if (potTarget === "operations") {
    batch.update(db.collection("operations_pot").doc("main"), {
      balance: FieldValue.increment(-amount),
      totalSpent: FieldValue.increment(amount),
    });
  } else if (toolId) {
    batch.update(db.collection("device_pots").doc(toolId), {
      balance: FieldValue.increment(-amount),
      totalSpent: FieldValue.increment(amount),
    });
  }

  await batch.commit();

  const payout = docWithId<PayboxPayout>(snap.id, data)!;
  payout.status = "completed";
  payout.completedAt = new Date().toISOString();
  return payout;
}

// ─── Disputes ────────────────────────────────────────────────────────────────

function disputeFromDoc(id: string, data: DocumentData): Dispute {
  return {
    id,
    loanId: data.loanId as string,
    toolId: data.toolId as string,
    memberId: data.memberId as string,
    gemachId: data.gemachId as string,
    status: (data.status as DisputeStatus) ?? "new",
    defect: parseDefectRecord(data.defect) ?? {
      category: "other",
      description: "",
      reportedAt: new Date().toISOString(),
    },
    damageAmount:
      typeof data.damageAmount === "number" ? data.damageAmount : undefined,
    mediatorIds: Array.isArray(data.mediatorIds)
      ? data.mediatorIds.filter((x): x is string => typeof x === "string")
      : [],
    mediatorDecisions:
      data.mediatorDecisions && typeof data.mediatorDecisions === "object"
        ? (data.mediatorDecisions as Record<string, MediatorDecision>)
        : undefined,
    resolvedAt: data.resolvedAt ? tsToIso(data.resolvedAt) : undefined,
    createdAt: data.createdAt ? tsToIso(data.createdAt) : new Date().toISOString(),
  };
}

function buildDisputeForBatch(params: {
  loanId: string;
  toolId: string;
  memberId: string;
  gemachId: string;
  defect: DefectRecord;
  members: Array<{ id: string; role?: string }>;
  batch: import("firebase-admin/firestore").WriteBatch;
}): Dispute {
  const id = newId("dispute");
  const mediatorIds = pickRandomMediators(params.members, [
    params.memberId,
  ]);
  const dispute: Dispute = {
    id,
    loanId: params.loanId,
    toolId: params.toolId,
    memberId: params.memberId,
    gemachId: params.gemachId,
    status: mediatorIds.length > 0 ? "mediators_assigned" : "new",
    defect: params.defect,
    mediatorIds,
    createdAt: new Date().toISOString(),
  };

  params.batch.set(getAdminDb().collection("disputes").doc(id), {
    ...omitUndefined(dispute as unknown as Record<string, unknown>),
    createdAt: FieldValue.serverTimestamp(),
  });

  return dispute;
}

export async function getAllDisputes(): Promise<Dispute[]> {
  const snap = await getAdminDb().collection("disputes").get();
  return snap.docs.map((d) => disputeFromDoc(d.id, d.data()));
}

export async function getDisputeById(id: string): Promise<Dispute | null> {
  const snap = await getAdminDb().collection("disputes").doc(id).get();
  if (!snap.exists) return null;
  return disputeFromDoc(snap.id, snap.data()!);
}

function filterDisputesForViewer(
  disputes: Dispute[],
  viewerId: string,
  viewAll: boolean
): Dispute[] {
  if (viewAll) return disputes;
  return disputes.filter((d) => d.mediatorIds.includes(viewerId));
}

export async function listDisputesForAdmin(params: {
  viewerId: string;
  viewAll: boolean;
}): Promise<AdminDisputeSummary[]> {
  const [disputes, tools, members] = await Promise.all([
    getAllDisputes(),
    getAllTools(),
    listMembers(),
  ]);
  const toolMap = new Map(tools.map((t) => [t.id, t]));
  const memberMap = new Map(members.map((m) => [m.id, m]));

  return filterDisputesForViewer(disputes, params.viewerId, params.viewAll)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((d) => ({
      id: d.id,
      toolName: toolMap.get(d.toolId)?.name ?? d.toolId,
      memberName: memberMap.get(d.memberId)?.name ?? d.memberId,
      status: d.status,
      progressLabel: disputeProgressLabel(d),
      createdAt: d.createdAt,
      isOpen: isDisputeOpen(d.status),
    }));
}

function buildDisputeMediators(
  dispute: Dispute,
  memberMap: Map<string, { name: string }>,
  viewerId: string,
  showAllVotes: boolean
): AdminDisputeDetail["mediators"] {
  const resolved = !isDisputeOpen(dispute.status);
  return dispute.mediatorIds.map((id) => {
    const decision = dispute.mediatorDecisions?.[id];
    const showDecision = resolved || showAllVotes || id === viewerId;
    return {
      id,
      name: memberMap.get(id)?.name ?? id,
      ...(showDecision && decision ? { decision } : {}),
    };
  });
}

export async function getDisputeDetailForAdmin(params: {
  disputeId: string;
  viewerId: string;
  viewAll: boolean;
  canVote: boolean;
  canAssignMediators: boolean;
}): Promise<AdminDisputeDetail | null> {
  const dispute = await getDisputeById(params.disputeId);
  if (!dispute) return null;

  if (
    !params.viewAll &&
    !dispute.mediatorIds.includes(params.viewerId)
  ) {
    return null;
  }

  const [tool, member, loan] = await Promise.all([
    getToolById(dispute.toolId),
    getMemberById(dispute.memberId),
    getLoanById(dispute.loanId),
  ]);
  const members = await listMembers();
  const memberMap = new Map(members.map((m) => [m.id, m]));

  return {
    id: dispute.id,
    loanId: dispute.loanId,
    toolId: dispute.toolId,
    toolName: tool?.name ?? dispute.toolId,
    memberId: dispute.memberId,
    memberName: member?.name ?? dispute.memberId,
    memberEmail: member?.email ?? "",
    gemachId: dispute.gemachId,
    status: dispute.status,
    progressLabel: disputeProgressLabel(dispute),
    defect: dispute.defect,
    damageAmount: dispute.damageAmount,
    mediators: buildDisputeMediators(
      dispute,
      memberMap,
      params.viewerId,
      params.viewAll
    ),
    createdAt: dispute.createdAt,
    resolvedAt: dispute.resolvedAt,
    canVote: params.canVote,
    canAssignMediators: params.canAssignMediators,
    myDecision: dispute.mediatorDecisions?.[params.viewerId],
    loan: {
      checkoutPhotoUrl: loan?.checkoutPhotoUrl,
      returnPhotoUrl: loan?.returnPhotoUrl,
      checkoutConditionNotes: loan?.checkoutConditionNotes,
      returnConditionNotes: loan?.returnConditionNotes,
      checkedOutAt: loan?.checkedOutAt,
      returnedAt: loan?.returnedAt,
    },
  };
}

export async function updateDisputeMediators(
  disputeId: string,
  mediatorIds: string[]
): Promise<Dispute> {
  const db = getAdminDb();
  const ref = db.collection("disputes").doc(disputeId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("המחלוקת לא נמצאה");

  const dispute = disputeFromDoc(snap.id, snap.data()!);
  const unique = [
    ...new Set(
      mediatorIds.filter(
        (id) => typeof id === "string" && id.trim() && id !== dispute.memberId
      )
    ),
  ];

  if (unique.length === 0) {
    throw new Error("נדרש לפחות מיישב אחד");
  }
  if (unique.length > 3) {
    throw new Error("ניתן לשבץ עד 3 מיישבים");
  }

  for (const id of unique) {
    const member = await getMemberById(id);
    if (!member) throw new Error(`חבר לא נמצא: ${id}`);
  }

  const status: DisputeStatus =
    unique.length > 0 ? "mediators_assigned" : "new";

  await ref.update({
    mediatorIds: unique,
    status,
    mediatorDecisions: FieldValue.delete(),
  });

  const updated = await ref.get();
  return disputeFromDoc(updated.id, updated.data()!);
}

export async function submitMediatorDecision(params: {
  disputeId: string;
  mediatorId: string;
  decision: MediatorDecision;
}): Promise<Dispute> {
  const db = getAdminDb();
  const ref = db.collection("disputes").doc(params.disputeId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("המחלוקת לא נמצאה");

  const dispute = disputeFromDoc(snap.id, snap.data()!);
  if (!dispute.mediatorIds.includes(params.mediatorId)) {
    throw new Error("אין הרשאה להכריע במחלוקת זו");
  }

  const decisions = { ...(dispute.mediatorDecisions ?? {}), [params.mediatorId]: params.decision };
  const votes = Object.values(decisions).filter((v) => v !== "abstain");
  const charge = votes.filter((v) => v === "charge_member").length;
  const waive = votes.filter((v) => v === "waive_member").length;
  const totalMediators = dispute.mediatorIds.length;
  const allVoted = votes.length >= totalMediators;

  let status: DisputeStatus = "deliberating";
  if (dispute.status === "mediators_assigned") status = "deliberating";
  let resolvedAt: string | undefined;

  if (allVoted && charge !== waive) {
    status = charge > waive ? "resolved_charge" : "resolved_waive";
    resolvedAt = new Date().toISOString();
  } else if (allVoted) {
    status = "closed";
    resolvedAt = new Date().toISOString();
  }

  await ref.update({
    mediatorDecisions: decisions,
    status,
    ...(resolvedAt ? { resolvedAt: FieldValue.serverTimestamp() } : {}),
  });

  return {
    ...dispute,
    mediatorDecisions: decisions,
    status,
    resolvedAt,
  };
}

// ─── Board dashboard ─────────────────────────────────────────────────────────

export async function getBoardDashboardData(): Promise<BoardDashboardData> {
  const [tools, loans, reservations, disputes, tickets, lateFees, opsPot, devicePots, payouts] =
    await Promise.all([
      getAllTools(),
      getAllLoans(),
      getAllReservations(),
      getAllDisputes(),
      listMaintenanceTickets(),
      listLateReturnFees(),
      getOperationsPot(),
      getDevicePots(),
      getPayboxPayouts(50),
    ]);

  const activeDisputes = disputes.filter(
    (d) => d.status !== "closed" && d.status !== "resolved_charge" && d.status !== "resolved_waive"
  ).length;

  const openReports = tickets.filter((t) => t.status !== "resolved").length;
  const unpaidLate = lateFees.filter((f) => !f.paid).reduce((s, f) => s + f.amount, 0);
  const pendingPayouts = payouts
    .filter((p) => p.status === "pending")
    .reduce((s, p) => s + p.amount, 0);

  const statusCounts = {
    available: 0,
    on_loan: 0,
    reserved: 0,
    maintenance: 0,
    disabled: 0,
  };
  for (const t of tools) {
    if (t.status in statusCounts) {
      statusCounts[t.status as keyof typeof statusCounts] += 1;
    }
  }

  const activeReservations = reservations.filter(
    (r) => r.status === "pending" || r.status === "confirmed"
  ).length;

  const members = await listMembers();
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const toolMap = new Map(tools.map((t) => [t.id, t]));

  const recentDisputes = [...disputes]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      toolName: toolMap.get(d.toolId)?.name ?? d.toolId,
      memberName: memberMap.get(d.memberId)?.name ?? d.memberId,
      status: d.status,
      createdAt: d.createdAt,
    }));

  return {
    logistics: {
      totalUnits: tools.length,
      availableUnits: statusCounts.available,
      onLoanUnits: statusCounts.on_loan,
      reservedUnits: statusCounts.reserved + activeReservations,
      maintenanceUnits: statusCounts.maintenance,
      disabledUnits: statusCounts.disabled,
      activeDisputes,
      openProblemReports: openReports,
    },
    finance: {
      operationsBalance: opsPot.balance,
      deviceBalanceTotal: devicePots.reduce((s, p) => s + p.balance, 0),
      totalIncome: opsPot.totalEarned + devicePots.reduce((s, p) => s + p.totalEarned, 0),
      totalExpenses: opsPot.totalSpent + devicePots.reduce((s, p) => s + p.totalSpent, 0),
      unpaidLateFees: unpaidLate,
      pendingPayouts,
    },
    recentDisputes,
  };
}

export async function countKindAvailabilityInWindow(
  catalogKey: string,
  schedule: {
    pickupDate: string;
    pickupTimeStart?: string;
    returnDate: string;
    returnTimeEnd?: string;
  }
): Promise<number> {
  const [tools, loans, reservations] = await Promise.all([
    getAllTools(),
    getAllLoans(),
    getAllReservations(),
  ]);
  const units = resolveKindUnits(tools, catalogKey);
  const { loanByTool, reservationByTool } = buildActiveHolders(loans, reservations);
  return countUnitsAvailableInWindow(units, schedule, reservationByTool, loanByTool);
}

export { getAdminDb } from "@/lib/firebase/admin-app";
