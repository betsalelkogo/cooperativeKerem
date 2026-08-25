import type { Tool, ToolStatus, ToolWithAvailability, ToolKindWithAvailability, ToolKindStats, Loan } from "@/lib/types";
import { formatAvailableFromLabel } from "@/lib/dates";
import {
  countUnitsLendableNow,
  countUnitsReservedForFuture,
  holdsForUnit,
  isUnitLendableNow,
  latestHoldReturnDate,
  type ReservationsByTool,
} from "@/lib/availability";

/** Stable grouping key for a tool kind within a gemach. */
export function toolKindKey(tool: Pick<Tool, "gemachId"> & { kindId?: string; id?: string }): string {
  const kindId = tool.kindId ?? tool.id ?? "";
  return `${tool.gemachId}:${kindId}`;
}

export function resolveKindId(data: { kindId?: unknown }, docId: string): string {
  return typeof data.kindId === "string" && data.kindId ? data.kindId : docId;
}

export function groupToolsByKind(tools: Tool[]): Map<string, Tool[]> {
  const groups = new Map<string, Tool[]>();
  for (const tool of tools) {
    const key = toolKindKey(tool);
    const list = groups.get(key) ?? [];
    list.push(tool);
    groups.set(key, list);
  }
  return groups;
}

export function resolveKindUnits(allTools: Tool[], catalogKey: string): Tool[] {
  const byId = allTools.find((t) => t.id === catalogKey);
  if (byId) {
    const kindId = byId.kindId ?? byId.id;
    return allTools.filter(
      (t) => t.gemachId === byId.gemachId && (t.kindId ?? t.id) === kindId
    );
  }
  const byKind = allTools.filter((t) => (t.kindId ?? t.id) === catalogKey);
  if (byKind.length > 0) return byKind;
  return [];
}

export function pickAvailableUnit(units: Tool[]): Tool | null {
  return units.find((t) => t.status === "available") ?? null;
}

/** Pick up to `quantity` available units; returns fewer if not enough stock. */
export function pickAvailableUnits(units: Tool[], quantity: number): Tool[] {
  const available = units.filter((t) => t.status === "available");
  return available.slice(0, Math.max(1, quantity));
}

function unitAvailableFrom(
  tool: Tool,
  loanByTool: Map<string, Loan>,
  reservationByTool: ReservationsByTool
): string | undefined {
  const holdReturn = latestHoldReturnDate(holdsForUnit(reservationByTool, tool.id));
  if (tool.status === "on_loan") {
    const due = loanByTool.get(tool.id)?.dueReturnDate;
    if (due && holdReturn) return due > holdReturn ? due : holdReturn;
    return holdReturn ?? due;
  }
  if (tool.status === "reserved") return holdReturn;
  return undefined;
}

function aggregateAvailability(
  units: Tool[],
  loanByTool: Map<string, Loan>,
  reservationByTool: ReservationsByTool
): Pick<ToolWithAvailability, "availableFrom" | "availabilityLabel"> {
  const unavailable = units.filter((t) => t.status !== "available");
  if (unavailable.length === 0) return {};

  let earliest: string | undefined;
  for (const tool of unavailable) {
    const availableFrom = unitAvailableFrom(tool, loanByTool, reservationByTool);
    if (availableFrom && (!earliest || availableFrom < earliest)) {
      earliest = availableFrom;
    }
  }

  const availabilityLabel = earliest ? formatAvailableFromLabel(earliest) : undefined;
  return { availableFrom: earliest, availabilityLabel };
}

export function buildToolKindWithAvailability(
  units: Tool[],
  loanByTool: Map<string, Loan>,
  reservationByTool: ReservationsByTool,
  extras?: Partial<ToolWithAvailability> & { location?: string; stats?: ToolKindStats }
): ToolKindWithAvailability | null {
  if (units.length === 0) return null;

  const representative = units[0];
  const kindId = representative.kindId ?? representative.id;
  // Soft reservations stay lendable until 1h before pickup — don't use raw status.
  const availableUnits = countUnitsLendableNow(units, reservationByTool, loanByTool);
  const reservedForFuture = countUnitsReservedForFuture(
    units,
    reservationByTool,
    loanByTool
  );
  const status: ToolStatus =
    availableUnits > 0
      ? "available"
      : reservedForFuture > 0
        ? "reserved"
        : representative.status;

  const lendableNow = units.find((t) =>
    isUnitLendableNow(t, reservationByTool, loanByTool)
  );

  return {
    catalogId: kindId,
    kindId,
    name: representative.name,
    description: representative.description,
    category: representative.category,
    loanFeeMin: representative.loanFeeMin,
    loanFeeMax: representative.loanFeeMax,
    defaultLoanHours: representative.defaultLoanHours,
    maxLoanHours: representative.maxLoanHours,
    safetyRules: representative.safetyRules,
    imageUrl: representative.imageUrl,
    imageUrls: representative.imageUrls,
    location: representative.location ?? extras?.location,
    brand: representative.brand,
    supplier: representative.supplier,
    purpose: representative.purpose,
    productAge: representative.productAge,
    youtubeUrl: representative.youtubeUrl,
    gemachId: representative.gemachId,
    status,
    totalUnits: units.length,
    availableUnits,
    representativeToolId: lendableNow?.id ?? pickAvailableUnit(units)?.id ?? representative.id,
    ...aggregateAvailability(units, loanByTool, reservationByTool),
    ...extras,
    stats: extras?.stats,
  };
}

export function inventoryLabel(kind: Pick<ToolKindWithAvailability, "totalUnits" | "availableUnits">): string | undefined {
  if (kind.totalUnits <= 1) return undefined;
  if (kind.availableUnits > 0) {
    return `${kind.availableUnits} מתוך ${kind.totalUnits} זמינים עכשיו`;
  }
  return `${kind.totalUnits} יחידות — אין זמינות כרגע`;
}

/** Future windows can still be booked while a unit is out or reserved. */
export function isKindReservable(
  kind: Pick<ToolKindWithAvailability, "status" | "totalUnits">
): boolean {
  return kind.totalUnits > 0 && kind.status !== "maintenance" && kind.status !== "disabled";
}

export function aggregateKindStatus(units: Pick<Tool, "status">[]): ToolStatus {
  if (units.some((u) => u.status === "available")) return "available";
  if (units.some((u) => u.status === "reserved")) return "reserved";
  if (units.some((u) => u.status === "on_loan")) return "on_loan";
  if (units.some((u) => u.status === "maintenance")) return "maintenance";
  return units[0]?.status ?? "disabled";
}
