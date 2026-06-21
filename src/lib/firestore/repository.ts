import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb, omitUndefined } from "@/lib/firebase/admin-app";
import type {
  AdminDashboardData,
  AdminMemberHistory,
  AdminMemberSummary,
  Loan,
  LateReturnFee,
  MaintenanceTicket,
  Member,
  MemberPayment,
  PayboxPayout,
  PayboxSettings,
  Reservation,
  Tool,
  ToolWithAvailability,
  Transaction,
  DevicePot,
  OperationsPot,
  Gemach,
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
  resolveKindId,
  groupToolsByKind,
  resolveKindUnits,
  pickAvailableUnit,
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

function newId(prefix: string) {
  return `${prefix}-${Date.now()}`;
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
  };
}

function loanFromDoc(id: string, data: DocumentData): Loan {
  const loan = docWithId<Loan>(id, data)!;
  if (data.checkedOutAt) loan.checkedOutAt = tsToIso(data.checkedOutAt);
  if (data.returnedAt) loan.returnedAt = tsToIso(data.returnedAt);
  if (typeof data.dueReturnDate === "string") loan.dueReturnDate = data.dueReturnDate;
  if (typeof data.dueReturnTimeEnd === "string") loan.dueReturnTimeEnd = data.dueReturnTimeEnd;
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
    const existing = loanByTool.get(loan.toolId);
    if (!existing || loanPriority[loan.status] > loanPriority[existing.status]) {
      loanByTool.set(loan.toolId, loan);
    }
  }

  const reservationByTool = new Map<string, Reservation>();
  for (const reservation of activeReservations) {
    const existing = reservationByTool.get(reservation.toolId);
    if (!existing || reservation.createdAt > existing.createdAt) {
      reservationByTool.set(reservation.toolId, reservation);
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
    adminNotes: representative.adminNotes,
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
  adminNotes?: string | null;
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
      });
    })
    .filter((k): k is ToolKindWithAvailability => k !== null);
}

export async function getToolKindWithAvailability(
  catalogKey: string
): Promise<ToolKindWithAvailability | null> {
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
  });
}

export async function pickAvailableToolUnit(catalogKey: string): Promise<Tool | null> {
  const tools = await getAllTools();
  const units = resolveKindUnits(tools, catalogKey);
  return pickAvailableUnit(units);
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
  const safetyRules = params.safetyRules?.length
    ? params.safetyRules
    : DEFAULT_SAFETY_RULES;

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
    createdAt: now,
  });
  return { ...data, id, createdAt: new Date().toISOString() };
}

export async function updateReservationStatus(id: string, status: Reservation["status"]) {
  await getAdminDb().collection("reservations").doc(id).update({ status });
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
    throw new Error("אין הרשאה לבטל שמירה זו");
  }
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    throw new Error("לא ניתן לבטל שמירה זו");
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
  batch.update(db.collection("reservations").doc(id), { status: "cancelled" });

  const tool = await getToolById(reservation.toolId);
  if (tool?.status === "reserved") {
    const onToolSnap = await db
      .collection("reservations")
      .where("toolId", "==", reservation.toolId)
      .get();

    const hasOtherActive = onToolSnap.docs.some((doc) => {
      if (doc.id === id) return false;
      const status = doc.data().status as Reservation["status"];
      return status === "pending" || status === "confirmed";
    });

    if (!hasOtherActive) {
      batch.update(db.collection("tools").doc(reservation.toolId), {
        status: "available",
      });
    }
  }

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

function memberFromDoc(id: string, data: DocumentData): Member {
  return {
    id,
    name: (data.name as string) ?? "חבר",
    email: (data.email as string) ?? "",
    hasPaymentMethod: (data.hasPaymentMethod as boolean) ?? false,
    role: roleFromMemberData(data),
    gemachAdminIds: gemachAdminIdsFromData(data),
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
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true }
  );

  return {
    id: params.uid,
    name: params.name,
    email: params.email,
    hasPaymentMethod: existing.exists
      ? ((existingData?.hasPaymentMethod as boolean) ?? false)
      : false,
    role,
    gemachAdminIds: existing.exists ? gemachAdminIdsFromData(existingData ?? {}) : [],
  };
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
      email: m.email,
      role: m.role,
      gemachAdminIds: m.gemachAdminIds,
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

  return {
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      gemachAdminIds: member.gemachAdminIds,
    },
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

  const member = memberFromDoc(memberId, (await ref.get()).data()!);
  return {
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    gemachAdminIds: member.gemachAdminIds,
  };
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
  loanId?: string;
}): Promise<Loan> {
  const payment =
    params.reservation.feeAmount > 0
      ? await getPaidPaymentForReservation(params.reservation.id)
      : null;
  if (params.reservation.feeAmount > 0 && !payment) {
    throw new Error("Payment required before checkout");
  }

  const db = getAdminDb();
  const split = splitPayment(params.reservation.feeAmount);
  const loanId = params.loanId ?? newId("loan");
  const txnId = newId("txn");

  const loan: Loan = {
    id: loanId,
    reservationId: params.reservation.id,
    memberId: params.reservation.memberId,
    toolId: params.reservation.toolId,
    status: "active",
    safetyAcknowledged: true,
    checkoutPhotoUrl: params.checkoutPhotoUrl,
    checkoutConditionNotes: params.checkoutConditionNotes?.trim() || undefined,
    checkoutItemsChecked: params.checkoutItemsChecked?.length
      ? params.checkoutItemsChecked
      : undefined,
    checkedOutAt: new Date().toISOString(),
    dueReturnDate: params.reservation.returnDate || undefined,
    dueReturnTimeEnd: params.reservation.returnTimeEnd ?? params.reservation.returnTimeStart,
  };

  const transaction: Transaction = {
    id: txnId,
    memberId: params.reservation.memberId,
    toolId: params.reservation.toolId,
    loanId,
    amount: split.totalAmount,
    operationsAmount: split.operationsAmount,
    deviceAmount: split.deviceAmount,
    createdAt: new Date().toISOString(),
  };

  const batch = db.batch();

  batch.set(db.collection("loans").doc(loanId), {
    ...omitUndefined(loan as unknown as Record<string, unknown>),
    checkedOutAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("transactions").doc(txnId), {
    ...transaction,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("reservations").doc(params.reservation.id), {
    status: "completed",
  });
  batch.update(db.collection("tools").doc(params.reservation.toolId), {
    status: "on_loan",
  });
  batch.set(
    db.collection("device_pots").doc(params.reservation.toolId),
    {
      toolId: params.reservation.toolId,
      balance: FieldValue.increment(split.deviceAmount),
      totalEarned: FieldValue.increment(split.deviceAmount),
      totalSpent: 0,
    },
    { merge: true }
  );
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
  return loan;
}

export async function completeLoanReturn(
  loanId: string,
  params: {
    returnPhotoUrl: string;
    returnConditionNotes?: string;
    returnItemsChecked?: string[];
  }
): Promise<{ loan: Loan; lateFee: LateReturnFee | null }> {
  const db = getAdminDb();
  const loan = await getLoanById(loanId);
  if (!loan) throw new Error("Loan not found");

  const returnedAt = new Date();
  const returnedAtIso = returnedAt.toISOString();
  const batch = db.batch();

  batch.update(db.collection("loans").doc(loanId), {
    status: "returned",
    returnPhotoUrl: params.returnPhotoUrl,
    returnConditionNotes: params.returnConditionNotes?.trim() || null,
    returnItemsChecked: params.returnItemsChecked?.length ? params.returnItemsChecked : null,
    returnedAt: FieldValue.serverTimestamp(),
  });
  batch.update(db.collection("tools").doc(loan.toolId), { status: "available" });

  let lateFee: LateReturnFee | null = null;
  const reservation = loan.reservationId
    ? await getReservationById(loan.reservationId)
    : null;

  if (reservation) {
    const { lateMinutes, dueAt } = computeLateness(reservation, returnedAt);
    const amount = calculateLateFeeAmount(lateMinutes);
    if (lateMinutes > 0 && amount > 0) {
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

  await batch.commit();

  return {
    loan: {
      ...loan,
      status: "returned",
      returnPhotoUrl: params.returnPhotoUrl,
      returnConditionNotes: params.returnConditionNotes?.trim() || undefined,
      returnItemsChecked: params.returnItemsChecked,
      returnedAt: returnedAtIso,
    },
    lateFee,
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

export { getAdminDb } from "@/lib/firebase/admin-app";
