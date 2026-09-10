import { getSql, withTransaction } from "@/lib/db/client";
import {
  toolFromRow,
  gemachFromRow,
  memberFromRow,
  reservationFromRow,
  loanFromRow,
  paymentFromRow,
  lateFeeFromRow,
  ticketFromRow,
  disputeFromRow,
  ledgerFromRow,
  peerLoanFromRow,
  payoutFromRow,
  devicePotFromRow,
  operationsPotFromRow,
  payboxSettingsFromData,
  accessCodesFromData,
} from "@/lib/db/mappers";
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
  AccessCodesRecord,
  Reservation,
  Tool,
  ToolWithAvailability,
  Transaction,
  Gemach,
  GemachPricingMode,
  GemachReservationMode,
  ToolKindWithAvailability,
  SafetyRule,
  AdminToolKindEdit,
  CurrentToolHolder,
} from "@/lib/types";
import {
  calculateLateFeeAmount,
  computeLateness,
  formatLateDuration,
  loanBorrowedFromIso,
} from "@/lib/late-fees";
import {
  isFirstPayout,
  splitFirstPayout,
  MEMBERSHIP_JOIN_MIN_NIS,
} from "@/lib/membership";
import {
  groupToolsByKind,
  buildToolKindWithAvailability,
  aggregateKindStatus,
} from "@/lib/tool-kinds";
import {
  PLATFORM_GEMACH_ID,
  PLATFORM_GEMACH_DISPLAY_NAME,
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
import { splitPayment, getOperationsPercent, formatCredits } from "@/lib/pots";
import {
  roleFromMemberData,
  DEFAULT_MEMBER_ROLE,
  gemachAdminIdsFromData,
} from "@/lib/admin";
import {
  formatAvailableFromLabel,
} from "@/lib/dates";
import {
  kindIdForTool,
  qrCodeForUnit,
  resolveToolFees,
  DEFAULT_SAFETY_RULES,
  DEFAULT_RETURN_INSTRUCTIONS,
  validateToolInput,
} from "@/lib/tools-admin";
import { disputeProgressLabel, isDisputeOpen, pickRandomMediators } from "@/lib/disputes";
import {
  activeReservationsForUnits,
  countUnitsAvailableInWindow,
  countUnitsLendableNow,
  countUnitsReservedForFuture,
  findNextHoldAfter,
  holdsForUnit,
  isReservationHardLockDue,
  latestHoldReturnDate,
  pickUnitsAvailableInWindow,
  pickUnitsLendableNow,
  primaryHold,
  reservationHardLockStart,
  RESERVATION_HARD_LOCK_HOURS,
  type AvailabilityOptions,
  type ReservationsByTool,
  type ReservationWindow,
} from "@/lib/availability";
import { formatReservationDateTimeHe, israelNowParts, reservationDateTime } from "@/lib/israel-time";
import { computeFixedHoursReservation } from "@/lib/reservation-times";
import {
  addOneBillingDay,
  BILLING_DAY_END_TIME,
  computeBillingDaysReservation,
  formatBillingDueLabel,
  isRemoteExtendDay,
} from "@/lib/billing-days";
import {
  isReservationNoShowExpired,
} from "@/lib/reservation-expiry";

type QueryClient = {
  query: (
    queryText: string,
    values?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

function asRecord(row: unknown): Record<string, unknown> {
  return row as Record<string, unknown>;
}

function mapRows<T>(rows: unknown[], map: (row: Record<string, unknown>) => T): T[] {
  return rows.map((row) => map(asRecord(row)));
}

async function txRows(
  client: QueryClient,
  queryText: string,
  values: unknown[] = []
): Promise<Record<string, unknown>[]> {
  const result = await client.query(queryText, values);
  return result.rows;
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function reservationToolIds(reservation: Reservation): string[] {
  if (reservation.toolIds?.length) return reservation.toolIds;
  return reservation.toolId ? [reservation.toolId] : [];
}

function loanToolIds(loan: Loan): string[] {
  if (loan.toolIds?.length) return loan.toolIds;
  return loan.toolId ? [loan.toolId] : [];
}

function memberSummary(m: Member): AdminMemberSummary {
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

function platformGemachFallback(fullDefaults = false): Gemach {
  return {
    id: PLATFORM_GEMACH_ID,
    name: PLATFORM_GEMACH_DISPLAY_NAME,
    slug: "kerem",
    pricingMode: "loan_fee",
    isPlatform: true,
    active: true,
    ...(fullDefaults
      ? {
          reservationMode: "fixed_hours" as const,
          defaultLoanHours: PLATFORM_DEFAULT_LOAN_HOURS,
          maxLoanHours: PLATFORM_MAX_LOAN_HOURS,
        }
      : {}),
  };
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
    for (const toolId of loanToolIds(loan)) {
      const existing = loanByTool.get(toolId);
      if (!existing || loanPriority[loan.status] > loanPriority[existing.status]) {
        loanByTool.set(toolId, loan);
      }
    }
  }

  const reservationByTool: ReservationsByTool = new Map();
  for (const reservation of activeReservations) {
    for (const toolId of reservationToolIds(reservation)) {
      const list = reservationByTool.get(toolId) ?? [];
      list.push(reservation);
      reservationByTool.set(toolId, list);
    }
  }

  return { activeLoans, activeReservations, loanByTool, reservationByTool };
}

const ACTIVE_LOAN_STATUSES = ["active", "checkout_pending", "return_pending"];
const ACTIVE_RESERVATION_STATUSES = ["pending", "confirmed"];

const queryMemo = new Map<string, { at: number; value: Promise<unknown> }>();
const QUERY_MEMO_MS = 120_000;
const MAINTAIN_MEMO_MS = 45_000;
const emptyHolders = () => buildActiveHolders([], []);

function memoQuery<T>(key: string, fn: () => Promise<T>, ttlMs = QUERY_MEMO_MS): Promise<T> {
  const now = Date.now();
  const hit = queryMemo.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn().catch((err) => {
    queryMemo.delete(key);
    throw err;
  });
  queryMemo.set(key, { at: now, value });
  return value;
}

function rememberQuery<T>(key: string, value: T) {
  queryMemo.set(key, { at: Date.now(), value: Promise.resolve(value) });
}

function invalidateQueryMemo() {
  queryMemo.clear();
}

async function getActiveLoans(): Promise<Loan[]> {
  return memoQuery("activeLoans", async () => {
    const sql = getSql();
    const rows = await sql`SELECT * FROM loans WHERE status = ANY(${ACTIVE_LOAN_STATUSES})`;
    return mapRows(rows, loanFromRow);
  });
}

async function getActiveReservations(): Promise<Reservation[]> {
  return memoQuery("activeReservations", async () => {
    const sql = getSql();
    const rows = await sql`SELECT * FROM reservations WHERE status = ANY(${ACTIVE_RESERVATION_STATUSES})`;
    return mapRows(rows, reservationFromRow);
  });
}

async function getHoldsForAvailability() {
  const [loans, reservations] = await Promise.all([
    getActiveLoans(),
    getActiveReservations(),
  ]);
  return { loans, reservations, ...buildActiveHolders(loans, reservations) };
}

async function getToolsByIds(ids: string[]): Promise<Tool[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const sql = getSql();
  const rows = await sql`SELECT * FROM tools WHERE id = ANY(${unique})`;
  return mapRows(rows, toolFromRow);
}

async function getToolsForCatalogKey(catalogKey: string): Promise<Tool[]> {
  return memoQuery(`toolsByKind:${catalogKey}`, async () => {
    const sql = getSql();
    const byKind = await sql`SELECT * FROM tools WHERE kind_id = ${catalogKey}`;
    if (byKind.length) {
      return mapRows(byKind, toolFromRow);
    }

    const byId = await sql`SELECT * FROM tools WHERE id = ${catalogKey}`;
    if (!byId.length) return [];
    const tool = toolFromRow(asRecord(byId[0]));
    const kindId = tool.kindId ?? tool.id;
    if (kindId === catalogKey) return [tool];

    const siblings = await sql`SELECT * FROM tools WHERE kind_id = ${kindId}`;
    const byIdMap = new Map<string, Tool>([[tool.id, tool]]);
    for (const row of siblings) {
      const sibling = toolFromRow(asRecord(row));
      if (sibling.gemachId === tool.gemachId) {
        byIdMap.set(sibling.id, sibling);
      }
    }
    return [...byIdMap.values()];
  });
}

export async function activeLoanToolIdsForMember(memberId: string): Promise<string[]> {
  const loans = await getActiveLoans();
  return loans.filter((l) => l.memberId === memberId).flatMap((l) => loanToolIds(l));
}

async function maintainReservationState(): Promise<void> {
  await memoQuery(
    "maintainReservationState",
    async () => {
      await expireStaleNoShowReservations();
      return null;
    },
    MAINTAIN_MEMO_MS
  );
}

function availabilityForTool(
  tool: Tool,
  loanByTool: Map<string, Loan>,
  reservationByTool: ReservationsByTool
): Pick<ToolWithAvailability, "availableFrom" | "availabilityLabel"> {
  if (tool.status === "available") return {};

  const holdReturn = latestHoldReturnDate(holdsForUnit(reservationByTool, tool.id));
  let availableFrom: string | undefined;
  if (tool.status === "on_loan") {
    const due = loanByTool.get(tool.id)?.dueReturnDate;
    if (due && holdReturn) availableFrom = due > holdReturn ? due : holdReturn;
    else availableFrom = holdReturn ?? due;
  } else if (tool.status === "reserved") {
    availableFrom = holdReturn;
  }

  const availabilityLabel = availableFrom
    ? formatAvailableFromLabel(availableFrom)
    : undefined;

  return { availableFrom, availabilityLabel };
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

export async function getAllGemachim(options?: {
  includeInactive?: boolean;
}): Promise<Gemach[]> {
  const includeInactive = Boolean(options?.includeInactive);
  return memoQuery(`gemachim:${includeInactive}`, () => loadAllGemachim(includeInactive));
}

async function loadAllGemachim(includeInactive: boolean): Promise<Gemach[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM gemachim`;
  if (!rows.length) {
    return [platformGemachFallback(true)];
  }
  const all = mapRows(rows, gemachFromRow);
  for (const gemach of all) {
    rememberQuery(`gemach:${gemach.id}`, gemach);
  }
  return includeInactive ? all : all.filter((g) => g.active);
}

export async function getGemachById(id: string): Promise<Gemach | null> {
  return memoQuery(`gemach:${id}`, async () => {
    const cachedLists = ["gemachim:false", "gemachim:true"]
      .map((key) => queryMemo.get(key))
      .filter((hit): hit is { at: number; value: Promise<unknown> } => Boolean(hit));
    for (const hit of cachedLists) {
      if (Date.now() - hit.at >= QUERY_MEMO_MS) continue;
      const list = (await hit.value) as Gemach[];
      const found = list.find((g) => g.id === id);
      if (found) return found;
    }

    const sql = getSql();
    const rows = await sql`SELECT * FROM gemachim WHERE id = ${id}`;
    if (!rows.length) {
      if (id === PLATFORM_GEMACH_ID) {
        return platformGemachFallback(false);
      }
      return null;
    }
    return gemachFromRow(asRecord(rows[0]));
  });
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
  const reservationMode = params.reservationMode ?? "date_range";

  return withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const existing = await txRows(client, "SELECT id FROM gemachim WHERE id = $1", [params.id]);
    if (existing.length) {
      throw new Error("מזהה גמ״ח כבר קיים — נסו מזהה אחר");
    }
    const memberRows = await txRows(client, "SELECT * FROM members WHERE id = $1", [params.createdBy]);
    if (!memberRows.length) {
      throw new Error("משתמש לא נמצא");
    }

    const memberData = memberFromRow(memberRows[0]);
    const role = memberData.role;
    const gemachAdminIds = memberData.gemachAdminIds ?? [];

    await client.query(
      `INSERT INTO gemachim (
        id, name, slug, description, pricing_mode, reservation_mode,
        default_loan_hours, max_loan_hours, maintenance_fee, paybox_group_url,
        location, cooperative_fee, is_platform, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, FALSE, TRUE
      )`,
      [
        params.id,
        params.name.trim(),
        params.id,
        params.description?.trim() || null,
        params.pricingMode,
        reservationMode,
        reservationMode === "fixed_hours" ? PARTNER_DEFAULT_LOAN_HOURS : null,
        reservationMode === "fixed_hours" ? PARTNER_MAX_LOAN_HOURS : null,
        params.pricingMode === "maintenance_only" && params.maintenanceFee !== undefined
          ? params.maintenanceFee
          : null,
        params.payboxGroupUrl?.trim() || null,
        params.location?.trim() || null,
        params.cooperativeFee !== undefined && params.cooperativeFee > 0
          ? params.cooperativeFee
          : null,
      ]
    );

    const nextAdminIds = gemachAdminIds.includes(params.id)
      ? gemachAdminIds
      : [...gemachAdminIds, params.id];
    const nextRole = role === "MEMBER" ? "GEMACH_ADMIN" : role;
    await client.query(
      `UPDATE members
       SET gemach_admin_ids = $1, role = $2, updated_at = NOW()
       WHERE id = $3`,
      [nextAdminIds, nextRole, params.createdBy]
    );

    const gemachOut = await txRows(client, "SELECT * FROM gemachim WHERE id = $1", [params.id]);
    const memberOut = await txRows(client, "SELECT * FROM members WHERE id = $1", [params.createdBy]);
    return {
      gemach: gemachFromRow(gemachOut[0]),
      member: memberFromRow(memberOut[0]),
    };
  });
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
  return withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const existing = await txRows(client, "SELECT * FROM gemachim WHERE id = $1", [params.gemachId]);
    if (!existing.length) {
      throw new Error("גמ״ח לא נמצא");
    }

    const sets: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let i = 1;

    if (params.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(params.name.trim());
    }
    if (params.description !== undefined) {
      sets.push(`description = $${i++}`);
      values.push(params.description.trim() || null);
    }
    if (params.payboxGroupUrl !== undefined) {
      sets.push(`paybox_group_url = $${i++}`);
      values.push(params.payboxGroupUrl?.trim() || null);
    }
    if (params.cooperativeFee === null) {
      sets.push("cooperative_fee = NULL");
    } else if (params.cooperativeFee !== undefined) {
      sets.push(`cooperative_fee = $${i++}`);
      values.push(Math.max(0, params.cooperativeFee));
    }
    if (params.location === null) {
      sets.push("location = NULL");
    } else if (params.location !== undefined) {
      sets.push(`location = $${i++}`);
      values.push(params.location.trim() || null);
    }
    if (params.pricingMode !== undefined) {
      sets.push(`pricing_mode = $${i++}`);
      values.push(params.pricingMode);
      if (params.pricingMode === "free") {
        sets.push("maintenance_fee = NULL");
      } else if (params.pricingMode === "loan_fee") {
        sets.push("cooperative_fee = NULL");
        sets.push("maintenance_fee = NULL");
      } else if (params.pricingMode === "maintenance_only") {
        sets.push("cooperative_fee = NULL");
      }
    }
    if (params.reservationMode !== undefined) {
      sets.push(`reservation_mode = $${i++}`);
      values.push(params.reservationMode);
    }
    if (params.maintenanceFee === null) {
      sets.push("maintenance_fee = NULL");
    } else if (params.maintenanceFee !== undefined) {
      sets.push(`maintenance_fee = $${i++}`);
      values.push(Math.max(0, params.maintenanceFee));
    }

    values.push(params.gemachId);
    const updated = await txRows(
      client,
      `UPDATE gemachim SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return gemachFromRow(updated[0]);
  });
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

  const loans = await getActiveLoans();
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

  const reservations = await getActiveReservations();
  const reservationsToCancel = reservations.filter(
    (r) =>
      toolIds.has(r.toolId) &&
      (r.status === "pending" || r.status === "confirmed")
  );

  const toolIdList = tools.map((t) => t.id);
  const reservationIds = reservationsToCancel.map((r) => r.id);

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    if (reservationIds.length) {
      await client.query(
        `UPDATE reservations
         SET status = 'cancelled'
         WHERE id = ANY($1)`,
        [reservationIds]
      );
      await client.query(
        `UPDATE payments SET status = 'failed'
         WHERE reservation_id = ANY($1) AND status = 'pending'`,
        [reservationIds]
      );
    }
    if (toolIdList.length) {
      await client.query("DELETE FROM device_pots WHERE id = ANY($1)", [toolIdList]);
      await client.query("DELETE FROM tools WHERE id = ANY($1)", [toolIdList]);
    }
    await client.query("DELETE FROM gemachim WHERE id = $1", [gemachId]);

    const admins = await txRows(
      client,
      "SELECT * FROM members WHERE $1 = ANY(gemach_admin_ids)",
      [gemachId]
    );
    for (const row of admins) {
      const member = memberFromRow(row);
      const remainingIds = (member.gemachAdminIds ?? []).filter((id) => id !== gemachId);
      const nextRole =
        member.role !== "ADMIN" && remainingIds.length === 0 ? "MEMBER" : member.role;
      await client.query(
        `UPDATE members
         SET gemach_admin_ids = $1, role = $2, updated_at = NOW()
         WHERE id = $3`,
        [remainingIds, nextRole, member.id]
      );
    }
  });

  invalidateQueryMemo();
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
    youtubeUrl: representative.youtubeUrl,
    adminNotes: representative.adminNotes,
    safetyRules: representative.safetyRules,
    returnInstructions: representative.returnInstructions,
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
  youtubeUrl?: string | null;
  adminNotes?: string | null;
  safetyRules?: SafetyRule[] | null;
  returnInstructions?: SafetyRule[] | null;
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

  const units = (await getToolsForCatalogKey(params.kindId)).filter(
    (t) => t.gemachId === params.gemachId
  );
  if (units.length === 0) {
    throw new Error("הכלי לא נמצא");
  }

  const fees = resolveToolFees(
    gemach,
    params.loanFeeMin ?? units[0].loanFeeMin,
    params.loanFeeMax ?? params.loanFeeMin ?? units[0].loanFeeMax
  );

  const sets: string[] = [
    "name = $1",
    "description = $2",
    "category = $3",
    "loan_fee_min = $4",
    "loan_fee_max = $5",
    "updated_at = NOW()",
  ];
  const values: unknown[] = [
    params.name.trim(),
    params.description.trim(),
    params.category.trim(),
    fees.loanFeeMin,
    fees.loanFeeMax,
  ];
  let i = 6;

  if (params.defaultLoanHours === null) {
    sets.push("default_loan_hours = NULL");
  } else if (params.defaultLoanHours !== undefined) {
    sets.push(`default_loan_hours = $${i++}`);
    values.push(params.defaultLoanHours);
  }

  if (params.maxLoanHours === null) {
    sets.push("max_loan_hours = NULL");
  } else if (params.maxLoanHours !== undefined) {
    sets.push(`max_loan_hours = $${i++}`);
    values.push(params.maxLoanHours);
  }

  if (params.imageUrl === null) {
    sets.push("image_url = NULL");
  } else if (params.imageUrl !== undefined) {
    sets.push(`image_url = $${i++}`);
    values.push(params.imageUrl);
  }

  if (params.adminNotes === null) {
    sets.push("admin_notes = NULL");
  } else if (params.adminNotes !== undefined) {
    const notes = params.adminNotes.trim();
    if (notes) {
      sets.push(`admin_notes = $${i++}`);
      values.push(notes);
    } else {
      sets.push("admin_notes = NULL");
    }
  }

  if (params.imageUrls === null) {
    sets.push("image_urls = NULL");
  } else if (params.imageUrls !== undefined) {
    if (params.imageUrls.length) {
      sets.push(`image_urls = $${i++}`);
      values.push(params.imageUrls);
    } else {
      sets.push("image_urls = NULL");
    }
  }

  if (params.safetyRules !== undefined) {
    sets.push(`safety_rules = $${i++}::jsonb`);
    values.push(JSON.stringify(params.safetyRules ?? []));
  }

  if (params.returnInstructions !== undefined) {
    sets.push(`return_instructions = $${i++}::jsonb`);
    values.push(JSON.stringify(params.returnInstructions ?? []));
  }

  if (params.location === null) {
    sets.push("location = NULL");
  } else if (params.location !== undefined) {
    const loc = params.location.trim();
    if (loc) {
      sets.push(`location = $${i++}`);
      values.push(loc);
    } else {
      sets.push("location = NULL");
    }
  }

  if (params.brand === null) {
    sets.push("brand = NULL");
  } else if (params.brand !== undefined) {
    const v = params.brand.trim();
    if (v) {
      sets.push(`brand = $${i++}`);
      values.push(v);
    } else {
      sets.push("brand = NULL");
    }
  }

  if (params.supplier === null) {
    sets.push("supplier = NULL");
  } else if (params.supplier !== undefined) {
    const v = params.supplier.trim();
    if (v) {
      sets.push(`supplier = $${i++}`);
      values.push(v);
    } else {
      sets.push("supplier = NULL");
    }
  }

  if (params.purpose === null) {
    sets.push("purpose = NULL");
  } else if (params.purpose !== undefined) {
    const v = params.purpose.trim();
    if (v) {
      sets.push(`purpose = $${i++}`);
      values.push(v);
    } else {
      sets.push("purpose = NULL");
    }
  }

  if (params.productAge === null) {
    sets.push("product_age = NULL");
  } else if (params.productAge !== undefined) {
    sets.push(`product_age = $${i++}`);
    values.push(params.productAge);
  }

  if (params.youtubeUrl === null) {
    sets.push("youtube_url = NULL");
  } else if (params.youtubeUrl !== undefined) {
    const v = params.youtubeUrl.trim();
    if (v) {
      sets.push(`youtube_url = $${i++}`);
      values.push(v);
    } else {
      sets.push("youtube_url = NULL");
    }
  }

  const unitIds = units.map((u) => u.id);
  values.push(unitIds);
  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(
      `UPDATE tools SET ${sets.join(", ")} WHERE id = ANY($${i})`,
      values
    );
  });
  invalidateQueryMemo();
  return { updated: units.length };
}

export { resolveReservationFee };

export async function getAllTools(): Promise<Tool[]> {
  return memoQuery("allTools", async () => {
    const sql = getSql();
    const rows = await sql`SELECT * FROM tools`;
    return mapRows(rows, toolFromRow);
  });
}

export async function getToolKindsWithAvailability(): Promise<ToolKindWithAvailability[]> {
  const [tools, gemachim] = await Promise.all([getAllTools(), getAllGemachim()]);
  const gemachMap = new Map(gemachim.map((g) => [g.id, g]));
  const { loanByTool, reservationByTool } = emptyHolders();
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
  catalogKey: string,
  options?: { includeHolds?: boolean }
): Promise<ToolKindWithAvailability | null> {
  const units = await getToolsForCatalogKey(catalogKey);
  if (units.length === 0) return null;

  const includeHolds = options?.includeHolds !== false;
  const [gemach, holds] = await Promise.all([
    getGemachById(units[0].gemachId),
    includeHolds ? getHoldsForAvailability() : Promise.resolve(null),
  ]);
  if (!gemach?.active) return null;

  const loanByTool = holds?.loanByTool ?? emptyHolders().loanByTool;
  const reservationByTool = holds?.reservationByTool ?? emptyHolders().reservationByTool;

  const kind = buildToolKindWithAvailability(units, loanByTool, reservationByTool, {
    ...gemachCatalogFields(gemach, units[0]),
    location: units[0].location ?? gemach.location,
    stats: {
      totalLoans: 0,
      activeLoans: units.filter((u) => u.status === "on_loan").length,
      uniqueBorrowers: 0,
    },
  });
  if (!kind) return null;

  const currentHolder =
    includeHolds && kind.availableUnits === 0 && holds
      ? await currentHolderForUnits(units, holds.loans)
      : undefined;

  return {
    ...kind,
    currentHolder,
    returnInstructions: units[0].returnInstructions,
  };
}

async function currentHolderForUnits(
  units: Tool[],
  loans: Loan[]
): Promise<CurrentToolHolder | undefined> {
  const unitIds = new Set(units.map((u) => u.id));
  const loan = loans.find((l) => loanToolIds(l).some((id) => unitIds.has(id)));
  if (!loan) return undefined;
  const member = await getMemberById(loan.memberId);
  const dueReturnDate = loan.dueReturnDate;
  const dueReturnTimeEnd = loan.dueReturnTimeEnd ?? BILLING_DAY_END_TIME;
  return {
    name: member?.name ?? "חבר",
    phone: member?.phone,
    dueReturnDate,
    dueReturnTimeEnd,
    dueLabel: formatBillingDueLabel(dueReturnDate, dueReturnTimeEnd),
  };
}

/**
 * Soft future reservations stay status=available until 1h before pickup.
 * Sync hard-locks / premature releases before counting or picking stock.
 */
export async function syncReservationHardLocks(): Promise<{
  locked: number;
  released: number;
}> {
  const now = new Date();
  const reservations = await getActiveReservations();
  const active = reservations.filter(
    (r) => r.status === "pending" || r.status === "confirmed"
  );
  const tools = await getToolsByIds(active.flatMap((r) => reservationToolIds(r)));
  const toolMap = new Map(tools.map((t) => [t.id, t]));

  const hardLockedToolIds = new Set<string>();
  for (const r of active) {
    if (!isReservationHardLockDue(r, now)) continue;
    for (const id of reservationToolIds(r)) hardLockedToolIds.add(id);
  }

  const lockIds: string[] = [];
  const releaseIds: string[] = [];

  for (const r of active) {
    const ids = reservationToolIds(r);
    if (isReservationHardLockDue(r, now)) {
      for (const id of ids) {
        const tool = toolMap.get(id);
        if (tool?.status === "available") {
          lockIds.push(id);
          toolMap.set(id, { ...tool, status: "reserved" });
        }
      }
    } else {
      for (const id of ids) {
        if (hardLockedToolIds.has(id)) continue;
        const tool = toolMap.get(id);
        if (tool?.status === "reserved") {
          releaseIds.push(id);
          toolMap.set(id, { ...tool, status: "available" });
        }
      }
    }
  }

  if (lockIds.length || releaseIds.length) {
    await withTransaction(async (raw) => {
      const client = raw as unknown as QueryClient;
      if (lockIds.length) {
        await client.query(
          `UPDATE tools SET status = 'reserved', updated_at = NOW() WHERE id = ANY($1)`,
          [lockIds]
        );
      }
      if (releaseIds.length) {
        await client.query(
          `UPDATE tools SET status = 'available', updated_at = NOW() WHERE id = ANY($1)`,
          [releaseIds]
        );
      }
    });
    invalidateQueryMemo();
  }

  return { locked: lockIds.length, released: releaseIds.length };
}

export async function pickAvailableToolUnits(
  catalogKey: string,
  quantity: number,
  schedule?: ReservationWindow,
  options?: AvailabilityOptions
): Promise<Tool[]> {
  if (!options?.skipMaintain) {
    await maintainReservationState();
  }
  const [units, holds] = await Promise.all([
    getToolsForCatalogKey(catalogKey),
    getHoldsForAvailability(),
  ]);
  const { loanByTool, reservationByTool } = holds;

  if (schedule) {
    return pickUnitsAvailableInWindow(
      units,
      schedule,
      reservationByTool,
      loanByTool,
      quantity,
      options
    );
  }

  return pickUnitsLendableNow(units, reservationByTool, loanByTool, quantity);
}

export async function pickAvailableToolUnit(
  catalogKey: string,
  schedule?: ReservationWindow
): Promise<Tool | null> {
  const picked = await pickAvailableToolUnits(catalogKey, 1, schedule);
  return picked[0] ?? null;
}

export async function getToolsWithAvailability(): Promise<ToolWithAvailability[]> {
  const [tools, holds, gemachim] = await Promise.all([
    getAllTools(),
    getHoldsForAvailability(),
    getAllGemachim(),
  ]);

  const gemachMap = new Map(gemachim.map((g) => [g.id, g]));
  const { loanByTool, reservationByTool } = holds;

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

  const [holds, gemach] = await Promise.all([
    getHoldsForAvailability(),
    getGemachById(tool.gemachId),
  ]);
  const gemachMap = new Map(gemach ? [[gemach.id, gemach]] : []);
  const { loanByTool, reservationByTool } = holds;

  const [enriched] = enrichToolsWithGemach([tool], gemachMap);
  return {
    ...enriched,
    ...availabilityForTool(tool, loanByTool, reservationByTool),
  };
}

export async function getToolById(id: string): Promise<Tool | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM tools WHERE id = ${id}`;
  return rows[0] ? toolFromRow(asRecord(rows[0])) : null;
}

export async function getToolByQrCode(qrCode: string): Promise<Tool | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM tools WHERE qr_code = ${qrCode} LIMIT 1`;
  return rows[0] ? toolFromRow(asRecord(rows[0])) : null;
}

export async function updateToolStatus(id: string, status: Tool["status"]) {
  await updateToolsStatus([id], status);
}

export async function updateToolsStatus(ids: string[], status: Tool["status"]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  const sql = getSql();
  await sql`UPDATE tools SET status = ${status}, updated_at = NOW() WHERE id = ANY(${unique})`;
  invalidateQueryMemo();
}

export async function updateToolKindStatus(params: {
  gemachId: string;
  kindId: string;
  status: "available" | "disabled" | "maintenance";
}): Promise<{ updated: number }> {
  const units = (await getToolsForCatalogKey(params.kindId)).filter(
    (t) => t.gemachId === params.gemachId
  );
  if (units.length === 0) {
    throw new Error("הכלי לא נמצא");
  }

  const updates: Array<{ id: string; status: Tool["status"] }> = [];

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
      updates.push({ id: tool.id, status: nextStatus });
    }
  }

  if (updates.length === 0) {
    throw new Error("אין יחידות שניתן לעדכן במצב הנוכחי");
  }

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    for (const u of updates) {
      await client.query(
        "UPDATE tools SET status = $1, updated_at = NOW() WHERE id = $2",
        [u.status, u.id]
      );
    }
  });
  invalidateQueryMemo();
  return { updated: updates.length };
}

export async function deleteToolKind(params: {
  gemachId: string;
  kindId: string;
}): Promise<{ deleted: number }> {
  if (params.gemachId !== PLATFORM_GEMACH_ID) {
    throw new Error("רק מנהל הקואופרטיב יכול למחוק כלים");
  }

  const units = (await getToolsForCatalogKey(params.kindId)).filter(
    (t) => t.gemachId === params.gemachId
  );
  if (units.length === 0) {
    throw new Error("הכלי לא נמצא");
  }

  const unitIds = new Set(units.map((u) => u.id));
  const [loans, reservations] = await Promise.all([
    getActiveLoans(),
    getActiveReservations(),
  ]);

  const busyLoans = loans.filter((l) =>
    loanToolIds(l).some((id) => unitIds.has(id))
  );
  if (busyLoans.length > 0) {
    throw new Error("לא ניתן למחוק — יש השאלות פעילות על הכלי");
  }

  const busyReservations = reservations.filter((r) =>
    reservationToolIds(r).some((id) => unitIds.has(id))
  );
  if (busyReservations.length > 0) {
    throw new Error("לא ניתן למחוק — יש שריונים פעילים על הכלי");
  }

  const ids = units.map((u) => u.id);
  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query("DELETE FROM device_pots WHERE id = ANY($1)", [ids]);
    await client.query("DELETE FROM tools WHERE id = ANY($1)", [ids]);
  });
  invalidateQueryMemo();
  return { deleted: units.length };
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
  returnInstructions?: SafetyRule[];
  defaultLoanHours?: number;
  maxLoanHours?: number;
  location?: string;
  brand?: string;
  supplier?: string;
  purpose?: string;
  productAge?: number;
  youtubeUrl?: string;
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
  const safetyRules =
    params.safetyRules !== undefined ? params.safetyRules : DEFAULT_SAFETY_RULES;

  const created: Tool[] = [];
  const baseId = Date.now().toString(36);

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    for (let i = 0; i < params.quantity; i++) {
      const toolId = `tool-${baseId}-${i + 1}`;
      const unitLabel = params.quantity > 1 ? `יחידה ${i + 1}` : undefined;
      const qrCode = `${qrCodeForUnit(params.gemachId, kindId, i)}-${baseId.toUpperCase()}`;

      await client.query(
        `INSERT INTO tools (
          id, name, description, category, qr_code, status,
          loan_fee_min, loan_fee_max, gemach_id, kind_id, unit_label,
          default_loan_hours, max_loan_hours, location, brand, supplier,
          purpose, product_age, youtube_url, safety_rules, return_instructions
        ) VALUES (
          $1, $2, $3, $4, $5, 'available',
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19::jsonb, $20::jsonb
        )`,
        [
          toolId,
          params.name.trim(),
          params.description.trim(),
          params.category.trim(),
          qrCode,
          fees.loanFeeMin,
          fees.loanFeeMax,
          params.gemachId,
          kindId,
          unitLabel ?? null,
          params.defaultLoanHours ?? null,
          params.maxLoanHours ?? null,
          params.location?.trim() || null,
          params.brand?.trim() || null,
          params.supplier?.trim() || null,
          params.purpose?.trim() || null,
          params.productAge !== undefined && Number.isFinite(params.productAge)
            ? params.productAge
            : null,
          params.youtubeUrl?.trim() || null,
          JSON.stringify(safetyRules),
          JSON.stringify(params.returnInstructions ?? []),
        ]
      );
      await client.query(
        `INSERT INTO device_pots (id, tool_id, balance, total_earned, total_spent)
         VALUES ($1, $2, 0, 0, 0)
         ON CONFLICT (id) DO UPDATE SET tool_id = EXCLUDED.tool_id`,
        [toolId, toolId]
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
        ...(params.youtubeUrl?.trim() ? { youtubeUrl: params.youtubeUrl.trim() } : {}),
        safetyRules,
      });
    }
  });

  invalidateQueryMemo();
  return { kindId, tools: created };
}

export async function getReservationById(id: string): Promise<Reservation | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM reservations WHERE id = ${id}`;
  return rows[0] ? reservationFromRow(asRecord(rows[0])) : null;
}

export async function createReservation(
  data: Omit<Reservation, "id" | "createdAt">
): Promise<Reservation> {
  const id = newId("res");
  const createdAt = new Date().toISOString();
  const sql = getSql();
  await sql`
    INSERT INTO reservations (
      id, member_id, tool_id, pickup_date, pickup_time_start, pickup_time_end,
      return_date, return_time_start, return_time_end, status, fee_amount,
      loan_duration_hours, kind_id, quantity, tool_ids, group_id, cooperative_fee_amount
    ) VALUES (
      ${id}, ${data.memberId}, ${data.toolId}, ${data.pickupDate},
      ${data.pickupTimeStart ?? null}, ${data.pickupTimeEnd ?? null},
      ${data.returnDate}, ${data.returnTimeStart ?? null}, ${data.returnTimeEnd ?? null},
      ${data.status}, ${data.feeAmount}, ${data.loanDurationHours ?? null},
      ${data.kindId ?? null}, ${data.quantity ?? null},
      ${data.toolIds?.length ? data.toolIds : null}, ${data.groupId ?? null},
      ${data.cooperativeFeeAmount ?? null}
    )
  `;
  invalidateQueryMemo();
  return { ...data, id, createdAt };
}

export async function updateReservationStatus(id: string, status: Reservation["status"]) {
  const sql = getSql();
  await sql`UPDATE reservations SET status = ${status} WHERE id = ${id}`;
  invalidateQueryMemo();
}

async function releaseReservedToolsForReservation(
  client: QueryClient,
  reservation: Reservation,
  reservationId: string
): Promise<void> {
  const toolIds = reservationToolIds(reservation);
  for (const toolId of toolIds) {
    const toolRows = await txRows(client, "SELECT * FROM tools WHERE id = $1", [toolId]);
    const tool = toolRows[0] ? toolFromRow(toolRows[0]) : null;
    if (tool?.status !== "reserved") continue;

    const onTool = await txRows(
      client,
      `SELECT id, status FROM reservations WHERE tool_id = $1`,
      [toolId]
    );
    let hasOtherActive = onTool.some((row) => {
      if (String(row.id) === reservationId) return false;
      const status = row.status as Reservation["status"];
      return status === "pending" || status === "confirmed";
    });

    if (!hasOtherActive) {
      const active = await txRows(
        client,
        `SELECT * FROM reservations WHERE status = ANY($1)`,
        [ACTIVE_RESERVATION_STATUSES]
      );
      hasOtherActive = mapRows(active, reservationFromRow).some(
        (r) => r.id !== reservationId && reservationToolIds(r).includes(toolId)
      );
    }

    if (!hasOtherActive) {
      await client.query(
        "UPDATE tools SET status = $1, updated_at = NOW() WHERE id = $2",
        ["available", toolId]
      );
    }
  }
}

export async function autoCancelNoShowReservation(
  reservationId: string
): Promise<Reservation | null> {
  const reservation = await getReservationById(reservationId);
  if (!reservation) return null;
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return reservation;
  }
  if (!isReservationNoShowExpired(reservation)) return reservation;

  const cancelled = await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const existingLoan = await txRows(
      client,
      "SELECT id FROM loans WHERE reservation_id = $1 LIMIT 1",
      [reservationId]
    );
    if (existingLoan.length) return false;

    await client.query(
      `UPDATE reservations
       SET status = 'cancelled', cancel_reason = 'no_show', cancelled_at = NOW()
       WHERE id = $1`,
      [reservationId]
    );
    await releaseReservedToolsForReservation(client, reservation, reservationId);
    await client.query(
      `UPDATE payments SET status = 'failed'
       WHERE reservation_id = $1 AND status = 'pending'`,
      [reservationId]
    );
    return true;
  });

  if (cancelled) {
    invalidateQueryMemo();
    const paidPayment = await getPaidPaymentForReservation(reservationId);
    if (paidPayment) {
      await refundPaidReservationToCredit({
        payment: paidPayment,
        reservationId,
        memberId: reservation.memberId,
      });
    }
  }
  return { ...reservation, status: cancelled ? "cancelled" : reservation.status };
}

export async function expireStaleNoShowReservations(): Promise<number> {
  const now = new Date();
  const reservations = await getActiveReservations();
  const expired = reservations.filter((r) => isReservationNoShowExpired(r, now));

  let count = 0;
  for (const r of expired) {
    const result = await autoCancelNoShowReservation(r.id);
    if (result?.status === "cancelled") count += 1;
  }

  await syncReservationHardLocks();
  return count;
}

export async function expireNoShowReservationIfNeeded(
  reservationId: string
): Promise<Reservation | null> {
  await autoCancelNoShowReservation(reservationId);
  return getReservationById(reservationId);
}

async function refundPaidReservationToCredit(params: {
  payment: MemberPayment;
  reservationId: string;
  memberId: string;
}): Promise<number> {
  const { payment, reservationId, memberId } = params;
  if (payment.status === "refunded") return 0;
  if (payment.status !== "paid") return 0;

  const amount = Math.round(payment.amount * 100) / 100;
  if (!(amount > 0)) {
    const sql = getSql();
    await sql`UPDATE payments SET status = 'refunded', refunded_at = NOW() WHERE id = ${payment.id}`;
    return 0;
  }

  const ledgerId = newId("cl");

  return withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const payRows = await txRows(client, "SELECT * FROM payments WHERE id = $1", [payment.id]);
    if (!payRows.length) return 0;
    const pay = paymentFromRow(payRows[0]);
    if (pay.status === "refunded") return 0;
    if (pay.status !== "paid") return 0;

    const refundAmount = Math.round(pay.amount * 100) / 100;
    if (!(refundAmount > 0)) {
      await client.query(
        "UPDATE payments SET status = 'refunded', refunded_at = NOW() WHERE id = $1",
        [payment.id]
      );
      return 0;
    }

    const memberRows = await txRows(client, "SELECT * FROM members WHERE id = $1", [memberId]);
    if (!memberRows.length) throw new Error("משתמש לא נמצא");
    const current = memberFromRow(memberRows[0]).creditBalance;
    const next = Math.round((current + refundAmount) * 100) / 100;

    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [next, memberId]
    );
    await client.query(
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, reservation_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        ledgerId,
        memberId,
        refundAmount,
        next,
        "refund",
        `החזר על ביטול שריון — הכלי לא נלקח — ${reservationId}`,
        reservationId,
        memberId,
      ]
    );
    await client.query(
      "UPDATE payments SET status = 'refunded', refunded_at = NOW() WHERE id = $1",
      [payment.id]
    );
    return refundAmount;
  });
}

export async function cancelReservation(
  id: string,
  memberId: string
): Promise<{ reservation: Reservation; refundedAmount: number; hadPaidPayment: boolean }> {
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

  const paidPayment = await getPaidPaymentForReservation(id);

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const existingLoan = await txRows(
      client,
      "SELECT id FROM loans WHERE reservation_id = $1 LIMIT 1",
      [id]
    );
    if (existingLoan.length) {
      throw new Error("כבר התחיל תהליך לקיחה — לא ניתן לבטל");
    }

    await client.query(
      `UPDATE reservations
       SET status = 'cancelled', cancel_reason = 'member', cancelled_at = NOW()
       WHERE id = $1`,
      [id]
    );
    await releaseReservedToolsForReservation(client, reservation, id);
    await client.query(
      `UPDATE payments SET status = 'failed'
       WHERE reservation_id = $1 AND status = 'pending'`,
      [id]
    );
  });

  invalidateQueryMemo();

  let refundedAmount = 0;
  if (paidPayment) {
    refundedAmount = await refundPaidReservationToCredit({
      payment: paidPayment,
      reservationId: id,
      memberId,
    });
  }

  return {
    reservation: { ...reservation, status: "cancelled" },
    refundedAmount,
    hadPaidPayment: Boolean(paidPayment),
  };
}

export async function getAllReservations(): Promise<Reservation[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM reservations`;
  return mapRows(rows, reservationFromRow);
}

export async function getReservationsByMember(memberId: string): Promise<Reservation[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM reservations WHERE member_id = ${memberId}`;
  return mapRows(rows, reservationFromRow);
}

export async function getLoanById(id: string): Promise<Loan | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM loans WHERE id = ${id}`;
  return rows[0] ? loanFromRow(asRecord(rows[0])) : null;
}

export async function getLoansByMember(memberId: string): Promise<Loan[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM loans WHERE member_id = ${memberId}`;
  return mapRows(rows, loanFromRow);
}

export async function getAllLoans(): Promise<Loan[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM loans`;
  return mapRows(rows, loanFromRow);
}

export async function getMemberById(uid: string): Promise<Member | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM members WHERE id = ${uid}`;
  return rows[0] ? memberFromRow(asRecord(rows[0])) : null;
}

export async function syncMemberFromAuth(params: {
  uid: string;
  name: string;
  email: string;
  photoURL?: string | null;
}): Promise<Member> {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM members WHERE id = ${params.uid}`;
  const existing = existingRows[0] ? memberFromRow(asRecord(existingRows[0])) : null;
  const role = existing
    ? roleFromMemberData({
        role: existing.role,
        gemachAdminIds: existing.gemachAdminIds,
      })
    : DEFAULT_MEMBER_ROLE;

  if (existing) {
    await sql`
      UPDATE members
      SET name = ${params.name},
          email = ${params.email},
          photo_url = ${params.photoURL ?? null},
          role = ${role},
          updated_at = NOW()
      WHERE id = ${params.uid}
    `;
  } else {
    await sql`
      INSERT INTO members (
        id, name, email, photo_url, has_payment_method, role, is_a_member, first_payout
      ) VALUES (
        ${params.uid}, ${params.name}, ${params.email}, ${params.photoURL ?? null},
        FALSE, ${role}, FALSE, TRUE
      )
    `;
  }

  return {
    id: params.uid,
    name: params.name,
    firstName: existing?.firstName,
    familyName: existing?.familyName,
    nameCompleted: existing?.nameCompleted === true,
    email: params.email,
    phone: existing?.phone,
    isAmember: existing?.isAmember ?? false,
    firstPayout: existing ? existing.firstPayout !== false : true,
    termsAcceptedAt: existing?.termsAcceptedAt,
    membershipOfferDismissedAt: existing?.membershipOfferDismissedAt,
    hasPaymentMethod: existing?.hasPaymentMethod ?? false,
    role,
    gemachAdminIds: existing ? gemachAdminIdsFromData({ gemachAdminIds: existing.gemachAdminIds }) : [],
    creditBalance: existing?.creditBalance ?? 0,
  };
}

export async function updateMemberFlags(
  memberId: string,
  updates: { isAmember?: boolean; firstPayout?: boolean }
): Promise<AdminMemberSummary> {
  const existing = await getMemberById(memberId);
  if (!existing) throw new Error("משתמש לא נמצא");

  const sql = getSql();
  const isAmember =
    typeof updates.isAmember === "boolean" ? updates.isAmember : existing.isAmember ?? false;
  const firstPayout =
    typeof updates.firstPayout === "boolean" ? updates.firstPayout : existing.firstPayout !== false;
  const rows = await sql`
    UPDATE members
    SET is_a_member = ${isAmember},
        first_payout = ${firstPayout},
        updated_at = NOW()
    WHERE id = ${memberId}
    RETURNING *
  `;
  return memberSummary(memberFromRow(asRecord(rows[0])));
}

export async function updateMemberPhone(uid: string, phone: string): Promise<Member> {
  const sql = getSql();
  const existing = await sql`SELECT id FROM members WHERE id = ${uid}`;
  if (!existing.length) throw new Error("משתמש לא נמצא");

  const rows = await sql`
    UPDATE members SET phone = ${phone}, updated_at = NOW() WHERE id = ${uid} RETURNING *
  `;
  return memberFromRow(asRecord(rows[0]));
}

export async function acceptMemberTerms(uid: string): Promise<Member> {
  const existing = await getMemberById(uid);
  if (!existing) throw new Error("משתמש לא נמצא");
  if (existing.termsAcceptedAt) return existing;

  const termsAcceptedAt = new Date().toISOString();
  const sql = getSql();
  const rows = await sql`
    UPDATE members
    SET terms_accepted_at = ${termsAcceptedAt}::timestamptz, updated_at = NOW()
    WHERE id = ${uid}
    RETURNING *
  `;
  return memberFromRow(asRecord(rows[0]));
}

export async function dismissMembershipOffer(uid: string): Promise<Member> {
  const existing = await getMemberById(uid);
  if (!existing) throw new Error("משתמש לא נמצא");
  if (existing.membershipOfferDismissedAt) return existing;

  const membershipOfferDismissedAt = new Date().toISOString();
  const sql = getSql();
  const rows = await sql`
    UPDATE members
    SET membership_offer_dismissed_at = ${membershipOfferDismissedAt}::timestamptz,
        updated_at = NOW()
    WHERE id = ${uid}
    RETURNING *
  `;
  return memberFromRow(asRecord(rows[0]));
}

export async function updateMemberName(
  uid: string,
  firstName: string,
  familyName: string
): Promise<Member> {
  const sql = getSql();
  const existing = await sql`SELECT id FROM members WHERE id = ${uid}`;
  if (!existing.length) throw new Error("משתמש לא נמצא");

  const name = `${firstName} ${familyName}`;
  const rows = await sql`
    UPDATE members
    SET first_name = ${firstName},
        family_name = ${familyName},
        name = ${name},
        name_completed = TRUE,
        updated_at = NOW()
    WHERE id = ${uid}
    RETURNING *
  `;
  return memberFromRow(asRecord(rows[0]));
}

export async function getAdminDashboard(options?: {
  gemachId?: string;
  includeGemachim?: boolean;
}): Promise<AdminDashboardData> {
  await syncReservationHardLocks();
  const gemachId = options?.gemachId;
  const lateFeeGemachFilter =
    gemachId ?? (options?.includeGemachim ? PLATFORM_GEMACH_ID : undefined);
  const [allTools, loans, reservations, gemachim, scopedGemach, openTickets, unpaidLateFees] =
    await Promise.all([
    getAllTools(),
    getActiveLoans(),
    getActiveReservations(),
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
      loans.filter((l) => loanToolIds(l).some((id) => toolIds.has(id))),
      reservations.filter((r) =>
        reservationToolIds(r).some((id) => toolIds.has(id))
      )
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
      const reservation = loan
        ? undefined
        : primaryHold(holdsForUnit(reservationByTool, tool.id));
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
      availableUnits: countUnitsLendableNow(units, reservationByTool, loanByTool),
      onLoanUnits: units.filter((t) => t.status === "on_loan").length,
      reservedUnits: countUnitsReservedForFuture(units, reservationByTool, loanByTool),
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

  const loanById = new Map(loans.map((l) => [l.id, l]));
  const reservationById = new Map(reservations.map((r) => [r.id, r]));

  const lateReturnFees = unpaidLateFees.map((fee) => {
    const tool = allToolMap.get(fee.toolId);
    const member = memberMap.get(fee.memberId);
    const gemach = gemachMap.get(fee.gemachId);
    const loan = loanById.get(fee.loanId);
    const reservation = reservationById.get(fee.reservationId);
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
      borrowedFrom: loanBorrowedFromIso(loan, reservation),
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
  const sql = getSql();
  const rows = await sql`SELECT * FROM members`;
  const normalized = query?.trim().toLowerCase() ?? "";

  return mapRows(rows, memberFromRow)
    .filter((m) => {
      if (!normalized) return true;
      return (
        m.email.toLowerCase().includes(normalized) ||
        m.name.toLowerCase().includes(normalized)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, "he"))
    .map(memberSummary);
}

/** @deprecated use listMembers */
export async function searchMembersByEmail(query: string): Promise<AdminMemberSummary[]> {
  return listMembers(query);
}

export async function getMemberHistory(memberId: string): Promise<AdminMemberHistory | null> {
  const member = await getMemberById(memberId);
  if (!member) return null;

  const [loans, reservations] = await Promise.all([
    getLoansByMember(memberId),
    getReservationsByMember(memberId),
  ]);
  const historyToolIds = [
    ...new Set([
      ...loans.flatMap((l) => loanToolIds(l)),
      ...reservations.flatMap((r) => reservationToolIds(r)),
    ]),
  ];
  const allTools = await getToolsByIds(historyToolIds);
  const toolMap = new Map(allTools.map((t) => [t.id, t]));

  const sortedLoans = [...loans].sort(
    (a, b) => (b.checkedOutAt ?? "").localeCompare(a.checkedOutAt ?? "")
  );
  const sortedReservations = [...reservations].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );

  const creditLedger = await getMemberCreditLedger(memberId);

  return {
    member: memberSummary(member),
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

  const sql = getSql();
  const existing = await sql`SELECT id FROM members WHERE id = ${memberId}`;
  if (!existing.length) {
    throw new Error("משתמש לא נמצא");
  }

  const rows = await sql`
    UPDATE members SET role = ${role}, updated_at = NOW() WHERE id = ${memberId} RETURNING *
  `;
  return memberSummary(memberFromRow(asRecord(rows[0])));
}

export async function getMemberCreditLedger(
  memberId: string,
  limit = 50
): Promise<CreditLedgerEntry[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM credit_ledger WHERE member_id = ${memberId}`;
  return mapRows(rows, ledgerFromRow)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

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

  const ledgerId = newId("cl");

  const { balanceAfter, entry } = await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const memberRows = await txRows(client, "SELECT * FROM members WHERE id = $1", [memberId]);
    if (!memberRows.length) throw new Error("משתמש לא נמצא");

    const member = memberFromRow(memberRows[0]);
    if (delta > 0 && member.isAmember !== true) {
      throw new Error("לא ניתן להוסיף יתרה למי שאינו רשום כחבר משלם בקואופרטיב");
    }

    const current = member.creditBalance;
    const next = Math.round((current + delta) * 100) / 100;
    if (next < 0) {
      throw new Error("היתרה אינה יכולה לרדת מתחת לאפס");
    }

    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [next, memberId]
    );
    const ledgerRows = await txRows(
      client,
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [ledgerId, memberId, delta, next, reason, note ?? null, createdBy]
    );
    return { balanceAfter: next, entry: ledgerFromRow(ledgerRows[0]) };
  });

  return { balance: balanceAfter, entry };
}

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

  const ledgerId = newId("cl");

  const result = await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const importRows = await txRows(
      client,
      "SELECT id FROM paybox_payment_imports WHERE id = $1",
      [importKey]
    );
    if (importRows.length) return { status: "duplicate" as const };

    const memberRows = await txRows(client, "SELECT * FROM members WHERE id = $1", [memberId]);
    if (!memberRows.length) throw new Error("משתמש לא נמצא");

    const member = memberFromRow(memberRows[0]);
    const isAmember = member.isAmember === true;

    if (!isAmember && amount < MEMBERSHIP_JOIN_MIN_NIS) {
      return { status: "rejected_not_member" as const };
    }

    const firstPayout = isFirstPayout({ firstPayout: member.firstPayout });
    const becameMember = !isAmember;
    const { membershipFee, credited } = splitFirstPayout(
      amount,
      becameMember && firstPayout
    );

    const current = member.creditBalance;
    const next = Math.round((current + credited) * 100) / 100;

    const feeNote =
      membershipFee > 0
        ? `${note ? `${note} · ` : ""}דמי חבר נוכו ₪${membershipFee} מתוך ₪${amount}`
        : note;

    await client.query(
      `UPDATE members
       SET credit_balance = $1,
           first_payout = CASE WHEN $2 THEN FALSE ELSE first_payout END,
           is_a_member = CASE WHEN $3 THEN TRUE ELSE is_a_member END,
           updated_at = NOW()
       WHERE id = $4`,
      [next, firstPayout, becameMember, memberId]
    );
    const ledgerRows = await txRows(
      client,
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [ledgerId, memberId, credited, next, "paybox_import", feeNote ?? null, createdBy]
    );
    await client.query(
      `INSERT INTO paybox_payment_imports (id, data) VALUES ($1, $2::jsonb)`,
      [
        importKey,
        JSON.stringify({
          id: importKey,
          memberId,
          amount,
          credited,
          membershipFee,
          ledgerId,
          note: feeNote,
          createdBy,
          createdAt: new Date().toISOString(),
        }),
      ]
    );
    return {
      status: "applied" as const,
      balance: next,
      credited,
      membershipFee,
      becameMember,
      entry: ledgerFromRow(ledgerRows[0]),
    };
  });

  if (result.status === "duplicate") return { status: "duplicate" };
  if (result.status === "rejected_not_member") return { status: "rejected_not_member" };

  return {
    status: "applied",
    balance: result.balance,
    entry: result.entry,
    credited: result.credited,
    membershipFee: result.membershipFee,
    becameMember: result.becameMember,
  };
}

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

  const pending = await getPendingPaymentForReservation(reservation.id);
  const paymentId = pending?.id ?? newId("pay");
  const ledgerId = newId("cl");

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const memberRows = await txRows(client, "SELECT * FROM members WHERE id = $1", [memberId]);
    const member = memberRows[0] ? memberFromRow(memberRows[0]) : null;
    const balance = member?.creditBalance ?? 0;

    const payRows = await txRows(client, "SELECT * FROM payments WHERE id = $1", [paymentId]);
    const alreadyApplied =
      payRows[0] && typeof paymentFromRow(payRows[0]).creditApplied === "number"
        ? (paymentFromRow(payRows[0]).creditApplied as number)
        : 0;

    if (alreadyApplied > 0) {
      return;
    }

    const creditApply = Math.min(balance, fee);
    if (creditApply <= 0) {
      throw new Error("אין יתרה זמינה לשימוש");
    }

    const balanceAfter = Math.round((balance - creditApply) * 100) / 100;
    const remaining = Math.max(0, Math.round((fee - creditApply) * 100) / 100);
    const paid = remaining <= 0;

    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [balanceAfter, memberId]
    );
    await client.query(
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, reservation_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        ledgerId,
        memberId,
        -creditApply,
        balanceAfter,
        "payment_debit",
        `תשלום מהיתרה בעת לקיחה — ${reservation.id}`,
        reservation.id,
        memberId,
      ]
    );

    if (payRows.length) {
      if (paid) {
        await client.query(
          `UPDATE payments
           SET credit_applied = $1, status = 'paid', provider = 'credit', paid_at = NOW()
           WHERE id = $2`,
          [creditApply, paymentId]
        );
      } else {
        await client.query(
          "UPDATE payments SET credit_applied = $1 WHERE id = $2",
          [creditApply, paymentId]
        );
      }
    } else {
      await client.query(
        `INSERT INTO payments (
          id, reservation_id, member_id, tool_id, amount, credit_applied,
          status, provider, paybox_group_url, paid_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, '', $9
        )`,
        [
          paymentId,
          reservation.id,
          memberId,
          reservation.toolId,
          fee,
          creditApply,
          paid ? "paid" : "pending",
          paid ? "credit" : "paybox_group",
          paid ? new Date() : null,
        ]
      );
    }
  });

  const payment = await getPaymentById(paymentId);
  if (!payment) throw new Error("התשלום לא נמצא");
  const creditApplied = payment.creditApplied ?? 0;
  const remaining = Math.max(0, Math.round((fee - creditApplied) * 100) / 100);
  return { payment, creditApplied, remaining, paid: remaining <= 0 };
}

export async function listMemberDirectory(
  excludeId?: string
): Promise<Array<{ id: string; name: string }>> {
  const sql = getSql();
  const rows = await sql`SELECT id, name FROM members`;
  return rows
    .map((d) => ({ id: String(asRecord(d).id ?? ""), name: String(asRecord(d).name ?? "חבר/ה") }))
    .filter((m) => m.id !== excludeId)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export async function memberHasOpenPeerDebt(memberId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT outstanding FROM credit_loans
    WHERE borrower_id = ${memberId} AND status = 'open'
    LIMIT 25
  `;
  return rows.some((d) => {
    const outstanding = Number(asRecord(d).outstanding);
    return Number.isFinite(outstanding) && outstanding > 0;
  });
}

export async function getPeerCreditSummary(memberId: string): Promise<{
  owed: PeerDebtSummary[];
  lent: PeerDebtSummary[];
}> {
  const sql = getSql();
  const [owedRows, lentRows] = await Promise.all([
    sql`SELECT * FROM credit_loans WHERE borrower_id = ${memberId} AND status = 'open'`,
    sql`SELECT * FROM credit_loans WHERE lender_id = ${memberId} AND status = 'open'`,
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
    owed: aggregate(mapRows(owedRows, peerLoanFromRow), "lender"),
    lent: aggregate(mapRows(lentRows, peerLoanFromRow), "borrower"),
  };
}

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

  const loanId = newId("cloan");
  const fromLedgerId = newId("cl");
  const toLedgerId = newId("cl");

  return withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const [fromRows, toRows] = await Promise.all([
      txRows(client, "SELECT * FROM members WHERE id = $1", [fromMemberId]),
      txRows(client, "SELECT * FROM members WHERE id = $1", [toMemberId]),
    ]);
    if (!fromRows.length) throw new Error("החשבון שלך לא נמצא");
    if (!toRows.length) throw new Error("המשתמש שאליו מעבירים לא נמצא");

    const fromMember = memberFromRow(fromRows[0]);
    const toMember = memberFromRow(toRows[0]);
    if (fromMember.creditBalance < amount) {
      throw new Error("אין מספיק יתרה להעברה");
    }

    const fromAfter = Math.round((fromMember.creditBalance - amount) * 100) / 100;
    const toAfter = Math.round((toMember.creditBalance + amount) * 100) / 100;

    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [fromAfter, fromMemberId]
    );
    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [toAfter, toMemberId]
    );

    const loanRows = await txRows(
      client,
      `INSERT INTO credit_loans (
        id, lender_id, lender_name, borrower_id, borrower_name,
        principal, outstanding, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
      RETURNING *`,
      [
        loanId,
        fromMemberId,
        fromMember.name || "חבר/ה",
        toMemberId,
        toMember.name || "חבר/ה",
        amount,
        amount,
      ]
    );

    await client.query(
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, peer_loan_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        fromLedgerId,
        fromMemberId,
        -amount,
        fromAfter,
        "peer_transfer_out",
        `העברת קרדיט לחבר ${toMember.name || "חבר/ה"}`,
        loanId,
        fromMemberId,
      ]
    );
    await client.query(
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, peer_loan_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        toLedgerId,
        toMemberId,
        amount,
        toAfter,
        "peer_transfer_in",
        `קבלת קרדיט מחבר ${fromMember.name || "חבר/ה"}`,
        loanId,
        fromMemberId,
      ]
    );

    return { loan: peerLoanFromRow(loanRows[0]) };
  });
}

export async function repayPeerCreditDebt(params: {
  borrowerId: string;
  lenderId: string;
}): Promise<{ repaid: number }> {
  const { borrowerId, lenderId } = params;
  if (borrowerId === lenderId) throw new Error("בקשה לא תקינה");

  const borrowerLedgerId = newId("cl");
  const lenderLedgerId = newId("cl");

  return withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const loanRows = await txRows(
      client,
      `SELECT * FROM credit_loans
       WHERE borrower_id = $1 AND lender_id = $2 AND status = 'open'`,
      [borrowerId, lenderId]
    );
    const total = loanRows.reduce((sum, row) => {
      const o = Number(row.outstanding);
      return sum + (Number.isFinite(o) ? o : 0);
    }, 0);
    const totalRounded = Math.round(total * 100) / 100;
    if (totalRounded <= 0) throw new Error("אין חוב פתוח להחזרה");

    const [borrowerRows, lenderRows] = await Promise.all([
      txRows(client, "SELECT * FROM members WHERE id = $1", [borrowerId]),
      txRows(client, "SELECT * FROM members WHERE id = $1", [lenderId]),
    ]);
    if (!borrowerRows.length) throw new Error("החשבון שלך לא נמצא");
    if (!lenderRows.length) throw new Error("המלווה לא נמצא");

    const borrower = memberFromRow(borrowerRows[0]);
    const lender = memberFromRow(lenderRows[0]);
    if (borrower.creditBalance < totalRounded) {
      throw new Error(
        "אין מספיק יתרה להחזרת החוב המלא — המתינו שהמנהל יטעין את היתרה"
      );
    }

    const borrowerAfter = Math.round((borrower.creditBalance - totalRounded) * 100) / 100;
    const lenderAfter = Math.round((lender.creditBalance + totalRounded) * 100) / 100;

    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [borrowerAfter, borrowerId]
    );
    await client.query(
      "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
      [lenderAfter, lenderId]
    );

    const loanIds = loanRows.map((r) => String(r.id));
    await client.query(
      `UPDATE credit_loans
       SET outstanding = 0, status = 'settled', settled_at = NOW()
       WHERE id = ANY($1)`,
      [loanIds]
    );

    await client.query(
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        borrowerLedgerId,
        borrowerId,
        -totalRounded,
        borrowerAfter,
        "peer_repay_out",
        `החזר חוב לחבר ${lender.name || "חבר/ה"}`,
        borrowerId,
      ]
    );
    await client.query(
      `INSERT INTO credit_ledger (
        id, member_id, delta, balance_after, reason, note, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        lenderLedgerId,
        lenderId,
        totalRounded,
        lenderAfter,
        "peer_repay_in",
        `קבלת החזר מחבר ${borrower.name || "חבר/ה"}`,
        borrowerId,
      ]
    );

    return { repaid: totalRounded };
  });
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

async function claimToolsForCheckout(reservation: Reservation): Promise<string[]> {
  const quantity = Math.max(
    1,
    reservation.quantity ?? reservationToolIds(reservation).length
  );
  const preferred = reservationToolIds(reservation);
  const catalogKey = reservation.kindId ?? preferred[0] ?? reservation.toolId;
  const schedule: ReservationWindow = {
    pickupDate: reservation.pickupDate,
    pickupTimeStart: reservation.pickupTimeStart,
    returnDate: reservation.returnDate,
    returnTimeEnd: reservation.returnTimeEnd,
  };

  const [units, holds] = await Promise.all([
    getToolsForCatalogKey(catalogKey),
    getHoldsForAvailability(),
  ]);
  const { loanByTool, reservationByTool } = holds;

  const claimed = pickUnitsAvailableInWindow(
    units,
    schedule,
    reservationByTool,
    loanByTool,
    quantity,
    {
      ignoreReservationId: reservation.id,
      ignoreLoanMemberId: reservation.memberId,
      preferToolIds: preferred,
    }
  );

  if (claimed.length < quantity) {
    throw new Error(
      `אין מספיק יחידות פנויות ללקיחה כרגע (נדרשות ${quantity}, זמינות ${claimed.length})`
    );
  }

  return claimed.map((t) => t.id);
}

/** Debit cooperative loan fee from credit at actual checkout (same transaction). */
async function debitReservationFeeFromCredit(
  client: QueryClient,
  params: { reservation: Reservation; memberId: string }
): Promise<void> {
  const fee = Math.round(params.reservation.feeAmount * 100) / 100;
  if (!(fee > 0)) return;

  const paidRows = await txRows(
    client,
    `SELECT id FROM payments
     WHERE reservation_id = $1 AND status = 'paid'
     LIMIT 1`,
    [params.reservation.id]
  );
  if (paidRows.length) return;

  const memberRows = await txRows(
    client,
    "SELECT * FROM members WHERE id = $1 FOR UPDATE",
    [params.memberId]
  );
  const member = memberRows[0] ? memberFromRow(memberRows[0]) : null;
  const balance = member?.creditBalance ?? 0;
  if (balance < fee) {
    throw new Error(
      balance <= 0
        ? "אין לך יתרה. בקואופרטיב ההשאלה מתבצעת מהיתרה בלבד — פנו למנהל להטענת יתרה."
        : `היתרה שלך (${formatCredits(balance)}) אינה מספיקה לדמי ההשאלה (${formatCredits(fee)}).`
    );
  }

  const balanceAfter = Math.round((balance - fee) * 100) / 100;
  const paymentId = newId("pay");
  const ledgerId = newId("cl");

  await client.query(
    "UPDATE members SET credit_balance = $1, updated_at = NOW() WHERE id = $2",
    [balanceAfter, params.memberId]
  );
  await client.query(
    `INSERT INTO credit_ledger (
      id, member_id, delta, balance_after, reason, note, reservation_id, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ledgerId,
      params.memberId,
      -fee,
      balanceAfter,
      "payment_debit",
      `תשלום מהיתרה בעת לקיחה — ${params.reservation.id}`,
      params.reservation.id,
      params.memberId,
    ]
  );
  await client.query(
    `INSERT INTO payments (
      id, reservation_id, member_id, tool_id, amount, credit_applied,
      status, provider, paybox_group_url, paid_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      'paid', 'credit', '', NOW()
    )`,
    [
      paymentId,
      params.reservation.id,
      params.memberId,
      params.reservation.toolId,
      fee,
      fee,
    ]
  );
}

export async function createLoanFromCheckout(params: {
  reservation: Reservation;
  checkoutPhotoUrl: string;
  checkoutConditionNotes?: string;
  checkoutItemsChecked?: string[];
  checkoutDefect?: DefectRecord;
  loanId?: string;
}): Promise<{ loan: Loan; loans: Loan[] }> {
  const checkoutTool = await getToolById(params.reservation.toolId);
  const checkoutGemach = checkoutTool
    ? await getGemachById(checkoutTool.gemachId)
    : null;
  const chargeCreditAtCheckout = Boolean(
    params.reservation.feeAmount > 0 &&
      checkoutGemach &&
      isPlatformGemach(checkoutGemach)
  );

  const payment =
    params.reservation.feeAmount > 0
      ? await getPaidPaymentForReservation(params.reservation.id)
      : null;
  if (params.reservation.feeAmount > 0 && !payment && !chargeCreditAtCheckout) {
    throw new Error("Payment required before checkout");
  }

  const toolIds = await claimToolsForCheckout(params.reservation);
  const split = splitPayment(params.reservation.feeAmount);
  const quantity = toolIds.length;
  const perUnitDevice = quantity > 0 ? split.deviceAmount / quantity : 0;
  const loanId = params.loanId ?? newId("loan");
  const txnId = newId("txn");

  const memberLoans = await getLoansByMember(params.reservation.memberId);
  const claimedSet = new Set(toolIds);
  const supersededLoans = memberLoans.filter((existing) => {
    if (existing.id === loanId) return false;
    if (
      existing.status !== "active" &&
      existing.status !== "checkout_pending" &&
      existing.status !== "return_pending"
    ) {
      return false;
    }
    return loanToolIds(existing).some((id) => claimedSet.has(id));
  });

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

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    if (chargeCreditAtCheckout) {
      await debitReservationFeeFromCredit(client, {
        reservation: params.reservation,
        memberId: params.reservation.memberId,
      });
    }
    await client.query(
      `UPDATE reservations
       SET tool_id = $1, tool_ids = $2, quantity = $3, status = 'completed'
       WHERE id = $4`,
      [toolIds[0], toolIds, toolIds.length, params.reservation.id]
    );

    await client.query(
      `INSERT INTO loans (
        id, reservation_id, member_id, tool_id, tool_ids, quantity, status,
        safety_acknowledged, checkout_photo_url, checkout_condition_notes,
        checkout_items_checked, checkout_defect, checked_out_at,
        due_return_date, due_return_time_end
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        TRUE, $8, $9,
        $10, $11::jsonb, NOW(),
        $12, $13
      )`,
      [
        loanId,
        params.reservation.id,
        params.reservation.memberId,
        toolIds[0],
        toolIds,
        quantity,
        "active",
        params.checkoutPhotoUrl,
        params.checkoutConditionNotes?.trim() || null,
        params.checkoutItemsChecked?.length ? params.checkoutItemsChecked : null,
        params.checkoutDefect ? JSON.stringify(params.checkoutDefect) : null,
        params.reservation.returnDate || null,
        params.reservation.returnTimeEnd ?? params.reservation.returnTimeStart ?? null,
      ]
    );

    for (const toolId of toolIds) {
      await client.query(
        "UPDATE tools SET status = $1, updated_at = NOW() WHERE id = $2",
        ["on_loan", toolId]
      );
      await client.query(
        `INSERT INTO device_pots (id, tool_id, balance, total_earned, total_spent)
         VALUES ($1, $2, $3, $3, 0)
         ON CONFLICT (id) DO UPDATE SET
           balance = device_pots.balance + $3,
           total_earned = device_pots.total_earned + $3`,
        [toolId, toolId, perUnitDevice]
      );
    }

    for (const previous of supersededLoans) {
      await client.query(
        `UPDATE loans
         SET status = 'returned',
             return_condition_notes = $1,
             returned_at = NOW()
         WHERE id = $2`,
        ["נסגר אוטומטית עקב שריון הארכה", previous.id]
      );
    }

    await client.query(
      `INSERT INTO transactions (
        id, member_id, tool_id, loan_id, amount, operations_amount, device_amount
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transaction.id,
        transaction.memberId,
        transaction.toolId,
        transaction.loanId,
        transaction.amount,
        transaction.operationsAmount,
        transaction.deviceAmount,
      ]
    );

    await client.query(
      `INSERT INTO operations_pot (id, balance, total_earned, total_spent)
       VALUES ('main', $1, $1, 0)
       ON CONFLICT (id) DO UPDATE SET
         balance = operations_pot.balance + $1,
         total_earned = operations_pot.total_earned + $1`,
      [split.operationsAmount]
    );
  });

  invalidateQueryMemo();
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
  const loan = await getLoanById(loanId);
  if (!loan) throw new Error("Loan not found");

  const hasDefect = Boolean(params.returnDefect);
  const loanStatus: Loan["status"] = hasDefect ? "disputed" : "returned";
  const toolStatus: Tool["status"] = hasDefect ? "maintenance" : "available";

  const returnedAt = new Date();
  const returnedAtIso = returnedAt.toISOString();
  const reservation = loan.reservationId
    ? await getReservationById(loan.reservationId)
    : null;

  let lateFee: LateReturnFee | null = null;
  let dispute: Dispute | undefined;
  const membersForDispute = hasDefect ? await listMembers() : [];
  const toolForFee =
    reservation || hasDefect ? await getToolById(loan.toolId) : null;

  if (reservation) {
    const { lateMinutes, dueAt } = computeLateness(reservation, returnedAt, {
      loan,
    });
    const amount = calculateLateFeeAmount(lateMinutes);
    if (lateMinutes > 0 && amount > 0 && !hasDefect) {
      const feeId = newId("late");
      lateFee = {
        id: feeId,
        loanId,
        reservationId: loan.reservationId,
        memberId: loan.memberId,
        toolId: loan.toolId,
        gemachId: toolForFee?.gemachId ?? PLATFORM_GEMACH_ID,
        dueAt: dueAt.toISOString(),
        returnedAt: returnedAtIso,
        lateMinutes,
        amount,
        paid: false,
        createdAt: returnedAtIso,
      };
    }
  }

  if (hasDefect && params.returnDefect) {
    dispute = buildDisputeRecord({
      loanId,
      toolId: loan.toolId,
      memberId: loan.memberId,
      gemachId: toolForFee?.gemachId ?? PLATFORM_GEMACH_ID,
      defect: params.returnDefect,
      members: membersForDispute,
    });
  }

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(
      `UPDATE loans SET
        status = $1,
        return_photo_url = $2,
        return_condition_notes = $3,
        return_items_checked = $4,
        return_ok = $5,
        return_defect = $6::jsonb,
        returned_at = NOW(),
        dispute_id = $7
       WHERE id = $8`,
      [
        loanStatus,
        params.returnPhotoUrl,
        params.returnConditionNotes?.trim() || null,
        params.returnItemsChecked?.length ? params.returnItemsChecked : null,
        params.returnOk === true ? true : null,
        params.returnDefect ? JSON.stringify(params.returnDefect) : null,
        dispute?.id ?? null,
        loanId,
      ]
    );

    const ids = loan.toolIds?.length ? loan.toolIds : [loan.toolId];
    await client.query(
      "UPDATE tools SET status = $1, updated_at = NOW() WHERE id = ANY($2)",
      [toolStatus, ids]
    );

    if (reservation && !hasDefect) {
      const nowParts = israelNowParts(returnedAt);
      await client.query(
        `UPDATE reservations
         SET return_date = $1, return_time_start = $2, return_time_end = $2
         WHERE id = $3`,
        [nowParts.date, nowParts.time, reservation.id]
      );
    }

    if (lateFee) {
      await client.query(
        `INSERT INTO late_return_fees (
          id, loan_id, reservation_id, member_id, tool_id, gemach_id,
          due_at, returned_at, late_minutes, amount, paid
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7::timestamptz, $8::timestamptz, $9, $10, FALSE
        )`,
        [
          lateFee.id,
          lateFee.loanId,
          lateFee.reservationId,
          lateFee.memberId,
          lateFee.toolId,
          lateFee.gemachId,
          lateFee.dueAt,
          lateFee.returnedAt,
          lateFee.lateMinutes,
          lateFee.amount,
        ]
      );
    }

    if (dispute) {
      await insertDispute(client, dispute);
    }
  });

  invalidateQueryMemo();
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
  const sql = getSql();
  await sql`UPDATE loans SET additional_photo_urls = ${additionalPhotoUrls} WHERE id = ${loanId}`;
  return { ...loan, additionalPhotoUrls };
}

export async function listLateReturnFees(options?: {
  paid?: boolean;
  includeCancelled?: boolean;
  gemachId?: string;
}): Promise<LateReturnFee[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM late_return_fees`;
  return mapRows(rows, lateFeeFromRow)
    .filter((fee) => {
      if (options?.paid !== undefined && fee.paid !== options.paid) return false;
      if (options?.paid === false && options?.includeCancelled !== true && fee.cancelled) {
        return false;
      }
      if (options?.gemachId && fee.gemachId !== options.gemachId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markLateReturnFeePaid(
  feeId: string,
  markedPaidBy: string
): Promise<LateReturnFee> {
  const existing = await getLateReturnFeeById(feeId);
  if (!existing) throw new Error("רשומת קנס לא נמצאה");
  if (existing.cancelled) throw new Error("הקנס בוטל — לא ניתן לסמן כשולם");
  if (existing.paid) return existing;

  const sql = getSql();
  await sql`
    UPDATE late_return_fees
    SET paid = TRUE, paid_at = NOW(), marked_paid_by = ${markedPaidBy}
    WHERE id = ${feeId}
  `;
  return {
    ...existing,
    paid: true,
    paidAt: new Date().toISOString(),
    markedPaidBy,
  };
}

export async function updateLateReturnFeeAmount(
  feeId: string,
  amount: number,
  updatedBy: string
): Promise<LateReturnFee> {
  if (!Number.isFinite(amount) || amount < 0 || amount > 50_000) {
    throw new Error("סכום הקנס אינו תקין");
  }
  const rounded = Math.round(amount);
  const existing = await getLateReturnFeeById(feeId);
  if (!existing) throw new Error("רשומת קנס לא נמצאה");
  if (existing.cancelled) throw new Error("הקנס בוטל — לא ניתן לערוך");
  if (existing.paid) throw new Error("הקנס כבר שולם — לא ניתן לערוך");

  const sql = getSql();
  await sql`
    UPDATE late_return_fees
    SET amount = ${rounded},
        amount_updated_at = NOW(),
        amount_updated_by = ${updatedBy}
    WHERE id = ${feeId}
  `;
  return { ...existing, amount: rounded };
}

export async function cancelLateReturnFee(
  feeId: string,
  cancelledBy: string,
  cancelReason?: string
): Promise<LateReturnFee> {
  const existing = await getLateReturnFeeById(feeId);
  if (!existing) throw new Error("רשומת קנס לא נמצאה");
  if (existing.cancelled) return existing;
  if (existing.paid) throw new Error("הקנס כבר סומן כשולם — לא ניתן לבטל");

  const reason = cancelReason?.trim() || "בוטל על ידי מנהל";
  const sql = getSql();
  await sql`
    UPDATE late_return_fees
    SET cancelled = TRUE,
        cancelled_at = NOW(),
        cancelled_by = ${cancelledBy},
        cancel_reason = ${reason}
    WHERE id = ${feeId}
  `;
  return {
    ...existing,
    cancelled: true,
    cancelledAt: new Date().toISOString(),
    cancelledBy,
    cancelReason: reason,
  };
}

async function getLateReturnFeeById(feeId: string): Promise<LateReturnFee | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM late_return_fees WHERE id = ${feeId}`;
  return rows[0] ? lateFeeFromRow(asRecord(rows[0])) : null;
}

export async function createMaintenanceTicket(
  data: Omit<MaintenanceTicket, "id" | "createdAt" | "status">
): Promise<MaintenanceTicket> {
  const id = newId("ticket");
  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(
      `INSERT INTO maintenance_tickets (
        id, tool_id, loan_id, member_id, description, status
      ) VALUES ($1, $2, $3, $4, $5, 'open')`,
      [id, data.toolId, data.loanId ?? null, data.memberId, data.description]
    );
    await client.query(
      "UPDATE tools SET status = $1, updated_at = NOW() WHERE id = $2",
      ["disabled", data.toolId]
    );
  });
  invalidateQueryMemo();
  return { ...data, id, status: "open", createdAt: new Date().toISOString() };
}

export async function resolveMaintenanceTicket(
  ticketId: string,
  params: { adminReply?: string; resolvedBy: string }
): Promise<MaintenanceTicket> {
  const existing = await getMaintenanceTicketById(ticketId);
  if (!existing) throw new Error("הדיווח לא נמצא");
  if (existing.status === "resolved") throw new Error("הדיווח כבר נסגר");

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(
      `UPDATE maintenance_tickets
       SET status = 'resolved',
           admin_reply = $1,
           resolved_at = NOW(),
           resolved_by = $2
       WHERE id = $3`,
      [params.adminReply?.trim() || null, params.resolvedBy, ticketId]
    );
    const toolRows = await txRows(client, "SELECT status FROM tools WHERE id = $1", [
      existing.toolId,
    ]);
    if (toolRows[0]?.status === "disabled") {
      await client.query(
        "UPDATE tools SET status = $1, updated_at = NOW() WHERE id = $2",
        ["available", existing.toolId]
      );
    }
  });
  invalidateQueryMemo();

  return {
    ...existing,
    status: "resolved",
    adminReply: params.adminReply?.trim() || undefined,
    resolvedAt: new Date().toISOString(),
    resolvedBy: params.resolvedBy,
  };
}

export async function listMaintenanceTickets(options?: {
  status?: MaintenanceTicket["status"] | MaintenanceTicket["status"][];
}): Promise<MaintenanceTicket[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM maintenance_tickets`;
  const statuses = options?.status
    ? Array.isArray(options.status)
      ? options.status
      : [options.status]
    : null;

  return mapRows(rows, ticketFromRow)
    .filter((t) => !statuses || statuses.includes(t.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMaintenanceTicketById(id: string): Promise<MaintenanceTicket | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM maintenance_tickets WHERE id = ${id}`;
  return rows[0] ? ticketFromRow(asRecord(rows[0])) : null;
}

export async function getDevicePots() {
  const sql = getSql();
  const rows = await sql`SELECT * FROM device_pots`;
  return mapRows(rows, devicePotFromRow);
}

export async function getOperationsPot() {
  const sql = getSql();
  const rows = await sql`SELECT * FROM operations_pot WHERE id = 'main'`;
  return operationsPotFromRow(rows[0] ? asRecord(rows[0]) : undefined);
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

export async function getPayboxSettings(): Promise<PayboxSettings> {
  return memoQuery("payboxSettings", async () => {
    const sql = getSql();
    const rows = await sql`SELECT data FROM settings WHERE id = 'paybox'`;
    const data = rows[0] ? (asRecord(rows[0]).data as Record<string, unknown> | undefined) : undefined;
    return payboxSettingsFromData(data);
  });
}

const ACCESS_CODES_DOC = "access-codes";

export async function getAccessCodes(): Promise<AccessCodesRecord> {
  return memoQuery("accessCodes", async () => {
    const sql = getSql();
    const rows = await sql`SELECT data FROM settings WHERE id = ${ACCESS_CODES_DOC}`;
    const data = rows[0] ? (asRecord(rows[0]).data as Record<string, unknown> | undefined) : undefined;
    return accessCodesFromData(data);
  });
}

export async function updateAccessCodes(params: {
  caravanCode: string;
  caravanNote: string;
  clubRoomCode: string;
  clubRoomNote: string;
}): Promise<AccessCodesRecord> {
  const existing = await getAccessCodes();
  const roomChanged = params.clubRoomCode !== existing.clubRoomCode;
  const payload = {
    caravanCode: params.caravanCode,
    caravanNote: params.caravanNote,
    clubRoomCode: params.clubRoomCode,
    clubRoomNote: params.clubRoomNote,
    clubRoomUpdatedAt: roomChanged ? new Date().toISOString() : existing.clubRoomUpdatedAt,
  };

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(
      `INSERT INTO settings (id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
      [ACCESS_CODES_DOC, JSON.stringify(payload)]
    );
  });
  invalidateQueryMemo();
  return getAccessCodes();
}

const RETURN_INSTRUCTIONS_DOC = "return-instructions";

export async function getDefaultReturnInstructions(): Promise<SafetyRule[]> {
  return memoQuery("returnInstructions", async () => {
    const sql = getSql();
    const rows = await sql`SELECT data FROM settings WHERE id = ${RETURN_INSTRUCTIONS_DOC}`;
    const data = rows[0]
      ? (asRecord(rows[0]).data as { rules?: SafetyRule[] } | undefined)
      : undefined;
    if (Array.isArray(data?.rules) && data.rules.length > 0) {
      return data.rules.filter((r) => r?.text?.trim()).map((r, i) => ({
        id: r.id || `ri-${i + 1}`,
        text: r.text.trim(),
      }));
    }
    return DEFAULT_RETURN_INSTRUCTIONS;
  });
}

export async function updateDefaultReturnInstructions(
  rules: SafetyRule[]
): Promise<SafetyRule[]> {
  const payload = {
    rules: rules
      .map((r) => ({ text: String(r.text ?? "").trim() }))
      .filter((r) => r.text)
      .map((r, i) => ({ id: `ri-${i + 1}`, text: r.text })),
  };
  const sql = getSql();
  await sql`
    INSERT INTO settings (id, data) VALUES (${RETURN_INSTRUCTIONS_DOC}, ${payload})
    ON CONFLICT (id) DO UPDATE SET data = ${payload}
  `;
  invalidateQueryMemo();
  return getDefaultReturnInstructions();
}

export async function resolveReturnInstructions(tool?: Tool | null): Promise<SafetyRule[]> {
  if (tool?.returnInstructions?.length) return tool.returnInstructions;
  return getDefaultReturnInstructions();
}

export async function getPaymentById(id: string): Promise<MemberPayment | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM payments WHERE id = ${id}`;
  return rows[0] ? paymentFromRow(asRecord(rows[0])) : null;
}

export async function getPendingPaymentForReservation(
  reservationId: string
): Promise<MemberPayment | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM payments
    WHERE reservation_id = ${reservationId} AND status = 'pending'
    LIMIT 1
  `;
  return rows[0] ? paymentFromRow(asRecord(rows[0])) : null;
}

export async function getPaidPaymentForReservation(
  reservationId: string
): Promise<MemberPayment | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM payments
    WHERE reservation_id = ${reservationId} AND status = 'paid'
    LIMIT 1
  `;
  return rows[0] ? paymentFromRow(asRecord(rows[0])) : null;
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

  const sql = getSql();
  await sql`
    INSERT INTO payments (
      id, reservation_id, member_id, tool_id, amount, status, provider,
      paybox_group_url, grow_payment_url
    ) VALUES (
      ${id}, ${payment.reservationId}, ${payment.memberId}, ${payment.toolId},
      ${payment.amount}, ${payment.status}, ${payment.provider},
      ${payment.payboxGroupUrl}, ${payment.growPaymentUrl ?? null}
    )
  `;

  return payment;
}

export async function markPaymentPaid(paymentId: string): Promise<MemberPayment> {
  const payment = await getPaymentById(paymentId);
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "paid") return payment;

  const sql = getSql();
  await sql`UPDATE payments SET status = 'paid', paid_at = NOW() WHERE id = ${paymentId}`;
  return {
    ...payment,
    status: "paid",
    paidAt: new Date().toISOString(),
  };
}

export async function updatePaymentPayboxFields(
  id: string,
  fields: { payboxGroupUrl?: string; growPaymentUrl?: string; provider?: string }
) {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (fields.payboxGroupUrl !== undefined) {
    sets.push(`paybox_group_url = $${i++}`);
    values.push(fields.payboxGroupUrl);
  }
  if (fields.growPaymentUrl !== undefined) {
    sets.push(`grow_payment_url = $${i++}`);
    values.push(fields.growPaymentUrl);
  }
  if (fields.provider !== undefined) {
    sets.push(`provider = $${i++}`);
    values.push(fields.provider);
  }
  if (!sets.length) return;
  values.push(id);
  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(`UPDATE payments SET ${sets.join(", ")} WHERE id = $${i}`, values);
  });
}

export async function getPayboxPayouts(limit = 20): Promise<PayboxPayout[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM paybox_payouts`;
  return mapRows(rows, payoutFromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
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

  if (params.potTarget === "operations") {
    const pot = await getOperationsPot();
    if (pot.balance < params.amount) throw new Error("Insufficient operations pot balance");
  } else {
    if (!params.toolId) throw new Error("Device pot requires toolId");
    const sql = getSql();
    const potRows = await sql`SELECT * FROM device_pots WHERE id = ${params.toolId}`;
    const balance = potRows[0] ? devicePotFromRow(asRecord(potRows[0])).balance : 0;
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

  const sql = getSql();
  await sql`
    INSERT INTO paybox_payouts (
      id, pot_target, tool_id, amount, group_url, status, note, created_by
    ) VALUES (
      ${id}, ${payout.potTarget}, ${payout.toolId ?? null}, ${payout.amount},
      ${payout.groupUrl}, ${payout.status}, ${payout.note ?? null}, ${payout.createdBy}
    )
  `;

  return payout;
}

export async function completePayboxPayout(payoutId: string): Promise<PayboxPayout> {
  return withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    const rows = await txRows(client, "SELECT * FROM paybox_payouts WHERE id = $1", [payoutId]);
    if (!rows.length) throw new Error("Payout not found");

    const payout = payoutFromRow(rows[0]);
    if (payout.status === "completed") return payout;
    if (payout.status === "cancelled") {
      throw new Error("Payout was cancelled");
    }

    await client.query(
      `UPDATE paybox_payouts SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [payoutId]
    );

    if (payout.potTarget === "operations") {
      await client.query(
        `UPDATE operations_pot
         SET balance = balance + $1, total_spent = total_spent + $2
         WHERE id = 'main'`,
        [-payout.amount, payout.amount]
      );
    } else if (payout.toolId) {
      await client.query(
        `UPDATE device_pots
         SET balance = balance + $1, total_spent = total_spent + $2
         WHERE id = $3`,
        [-payout.amount, payout.amount, payout.toolId]
      );
    }

    return {
      ...payout,
      status: "completed",
      completedAt: new Date().toISOString(),
    };
  });
}

function buildDisputeRecord(params: {
  loanId: string;
  toolId: string;
  memberId: string;
  gemachId: string;
  defect: DefectRecord;
  members: Array<{ id: string; role?: string }>;
}): Dispute {
  const id = newId("dispute");
  const mediatorIds = pickRandomMediators(params.members, [params.memberId]);
  return {
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
}

async function insertDispute(client: QueryClient, dispute: Dispute): Promise<void> {
  await client.query(
    `INSERT INTO disputes (
      id, loan_id, tool_id, member_id, gemach_id, status, defect, mediator_ids
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      dispute.id,
      dispute.loanId,
      dispute.toolId,
      dispute.memberId,
      dispute.gemachId,
      dispute.status,
      JSON.stringify(dispute.defect),
      dispute.mediatorIds,
    ]
  );
}

export async function getAllDisputes(): Promise<Dispute[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM disputes`;
  return mapRows(rows, disputeFromRow);
}

export async function getDisputeById(id: string): Promise<Dispute | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM disputes WHERE id = ${id}`;
  return rows[0] ? disputeFromRow(asRecord(rows[0])) : null;
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

  if (!params.viewAll && !dispute.mediatorIds.includes(params.viewerId)) {
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
  const dispute = await getDisputeById(disputeId);
  if (!dispute) throw new Error("המחלוקת לא נמצאה");

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

  const status: DisputeStatus = unique.length > 0 ? "mediators_assigned" : "new";
  const sql = getSql();
  const rows = await sql`
    UPDATE disputes
    SET mediator_ids = ${unique},
        status = ${status},
        mediator_decisions = NULL
    WHERE id = ${disputeId}
    RETURNING *
  `;
  return disputeFromRow(asRecord(rows[0]));
}

export async function submitMediatorDecision(params: {
  disputeId: string;
  mediatorId: string;
  decision: MediatorDecision;
}): Promise<Dispute> {
  const dispute = await getDisputeById(params.disputeId);
  if (!dispute) throw new Error("המחלוקת לא נמצאה");
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

  await withTransaction(async (raw) => {
    const client = raw as unknown as QueryClient;
    await client.query(
      `UPDATE disputes
       SET mediator_decisions = $1::jsonb,
           status = $2,
           resolved_at = $3
       WHERE id = $4`,
      [JSON.stringify(decisions), status, resolvedAt ?? null, params.disputeId]
    );
  });

  return {
    ...dispute,
    mediatorDecisions: decisions,
    status,
    resolvedAt,
  };
}

export async function getBoardDashboardData(): Promise<BoardDashboardData> {
  await syncReservationHardLocks();
  const [tools, loans, reservations, disputes, tickets, lateFees, opsPot, devicePots, payouts] =
    await Promise.all([
      getAllTools(),
      getActiveLoans(),
      getActiveReservations(),
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

  const { loanByTool, reservationByTool } = buildActiveHolders(loans, reservations);
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
      availableUnits: countUnitsLendableNow(tools, reservationByTool, loanByTool),
      onLoanUnits: statusCounts.on_loan,
      reservedUnits: countUnitsReservedForFuture(tools, reservationByTool, loanByTool),
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
  },
  options?: Pick<AvailabilityOptions, "ignoreLoanMemberId">
): Promise<number> {
  const detail = await getKindScheduleAvailability(catalogKey, schedule, options);
  return detail.availableUnits;
}

export type KindScheduleAvailability = {
  availableUnits: number;
  totalUnits: number;
  lendableNow: number;
  reservedForFuture: number;
  hardLockHours: number;
  nextHold: null | {
    pickupDate: string;
    pickupTimeStart?: string;
    returnDate: string;
    returnTimeEnd?: string;
    quantity: number;
    hardLockAtLabel: string;
    mustReturnByLabel: string;
  };
};

function computeKindScheduleAvailability(
  units: Tool[],
  loanByTool: Map<string, Loan>,
  reservationByTool: ReservationsByTool,
  schedule: ReservationWindow,
  options?: Pick<AvailabilityOptions, "ignoreLoanMemberId">
): KindScheduleAvailability {
  const availableUnits = countUnitsAvailableInWindow(
    units,
    schedule,
    reservationByTool,
    loanByTool,
    options
  );
  const lendableNow = countUnitsLendableNow(units, reservationByTool, loanByTool);
  const reservedForFuture = countUnitsReservedForFuture(
    units,
    reservationByTool,
    loanByTool
  );

  const scheduleStart = reservationDateTime(
    schedule.pickupDate,
    schedule.pickupTimeStart ?? "00:00"
  ).getTime();
  const kindReservations = activeReservationsForUnits(units, reservationByTool);
  const next = findNextHoldAfter(kindReservations, scheduleStart);

  let nextHold: KindScheduleAvailability["nextHold"] = null;
  if (next) {
    const hardLockAt = reservationHardLockStart(next);
    const qty = next.quantity ?? (next.toolIds?.length || 1);
    nextHold = {
      pickupDate: next.pickupDate,
      pickupTimeStart: next.pickupTimeStart,
      returnDate: next.returnDate,
      returnTimeEnd: next.returnTimeEnd,
      quantity: qty,
      hardLockAtLabel: formatReservationDateTimeHe(hardLockAt),
      mustReturnByLabel: formatReservationDateTimeHe(hardLockAt),
    };
  }

  return {
    availableUnits,
    totalUnits: units.length,
    lendableNow,
    reservedForFuture,
    hardLockHours: RESERVATION_HARD_LOCK_HOURS,
    nextHold,
  };
}

export async function getKindScheduleAvailability(
  catalogKey: string,
  schedule: ReservationWindow,
  options?: Pick<AvailabilityOptions, "ignoreLoanMemberId">
): Promise<KindScheduleAvailability> {
  const [units, holds] = await Promise.all([
    getToolsForCatalogKey(catalogKey),
    getHoldsForAvailability(),
  ]);
  return computeKindScheduleAvailability(
    units,
    holds.loanByTool,
    holds.reservationByTool,
    schedule,
    options
  );
}

export async function getKindScheduleAvailabilityForHours(
  catalogKey: string,
  pickupDate: string,
  pickupTimeStart: string,
  hours: number[],
  options?: Pick<AvailabilityOptions, "ignoreLoanMemberId">
): Promise<{ hours: number; availability: KindScheduleAvailability }[]> {
  const [units, holds] = await Promise.all([
    getToolsForCatalogKey(catalogKey),
    getHoldsForAvailability(),
  ]);
  return hours.map((h) => {
    const fixed = computeFixedHoursReservation(pickupDate, pickupTimeStart, h);
    const schedule: ReservationWindow = {
      pickupDate: fixed.pickupDate,
      pickupTimeStart: fixed.pickupTimeStart,
      returnDate: fixed.returnDate,
      returnTimeEnd: fixed.returnTimeEnd,
    };
    return {
      hours: h,
      availability: computeKindScheduleAvailability(
        units,
        holds.loanByTool,
        holds.reservationByTool,
        schedule,
        options
      ),
    };
  });
}

export async function getKindScheduleAvailabilityForDays(
  catalogKey: string,
  pickupDate: string,
  pickupTimeStart: string,
  days: number[],
  options?: Pick<AvailabilityOptions, "ignoreLoanMemberId">
): Promise<{ days: number; availability: KindScheduleAvailability }[]> {
  const [units, holds] = await Promise.all([
    getToolsForCatalogKey(catalogKey),
    getHoldsForAvailability(),
  ]);
  return days.map((d) => {
    const fixed = computeBillingDaysReservation(pickupDate, pickupTimeStart, d);
    const schedule: ReservationWindow = {
      pickupDate: fixed.pickupDate,
      pickupTimeStart: fixed.pickupTimeStart,
      returnDate: fixed.returnDate,
      returnTimeEnd: fixed.returnTimeEnd,
    };
    return {
      days: d,
      availability: computeKindScheduleAvailability(
        units,
        holds.loanByTool,
        holds.reservationByTool,
        schedule,
        options
      ),
    };
  });
}

export async function canExtendActiveLoan(loan: Loan): Promise<{
  canExtend: boolean;
  reason?: string;
}> {
  if (loan.status !== "active") {
    return { canExtend: false, reason: "ההשאלה אינה פעילה" };
  }
  if (!isRemoteExtendDay(loan.checkedOutAt)) {
    return { canExtend: false, reason: "הארכה מקוונת נפתחת ביום השלישי להשאלה" };
  }
  if (!loan.dueReturnDate) {
    return { canExtend: false, reason: "חסר מועד החזרה" };
  }
  return { canExtend: true };
}

export async function extendActiveLoan(params: {
  loanId: string;
  memberId: string;
}): Promise<Loan> {
  const loan = await getLoanById(params.loanId);
  if (!loan) throw new Error("ההשאלה לא נמצאה");
  if (loan.memberId !== params.memberId) {
    throw new Error("אין הרשאה להאריך השאלה זו");
  }

  const eligibility = await canExtendActiveLoan(loan);
  if (!eligibility.canExtend) {
    throw new Error(eligibility.reason ?? "לא ניתן להאריך");
  }

  const dueDate = loan.dueReturnDate as string;
  const dueTime = loan.dueReturnTimeEnd ?? BILLING_DAY_END_TIME;
  const next = addOneBillingDay(dueDate, dueTime);
  const toolIds = loanToolIds(loan);
  const catalogKey = toolIds[0];
  const firstTool = await getToolById(catalogKey);
  const kindKey = firstTool?.kindId ?? catalogKey;

  const extensionWindow: ReservationWindow = {
    pickupDate: dueDate,
    pickupTimeStart: dueTime,
    returnDate: next.date,
    returnTimeEnd: next.time,
  };

  const units = await pickAvailableToolUnits(kindKey, toolIds.length, extensionWindow, {
    skipMaintain: true,
    ignoreLoanMemberId: params.memberId,
    preferToolIds: toolIds,
  });
  const claimed = new Set(units.map((u) => u.id));
  if (toolIds.some((id) => !claimed.has(id))) {
    throw new Error("לא ניתן להאריך — הכלי משוריין למשתמש אחר בחלון הבא");
  }

  const sql = getSql();
  await sql`
    UPDATE loans
    SET due_return_date = ${next.date},
        due_return_time_end = ${next.time}
    WHERE id = ${loan.id}
  `;
  if (loan.reservationId) {
    await sql`
      UPDATE reservations
      SET return_date = ${next.date},
          return_time_start = ${next.time},
          return_time_end = ${next.time}
      WHERE id = ${loan.reservationId}
    `;
  }
  invalidateQueryMemo();
  return {
    ...loan,
    dueReturnDate: next.date,
    dueReturnTimeEnd: next.time,
  };
}
