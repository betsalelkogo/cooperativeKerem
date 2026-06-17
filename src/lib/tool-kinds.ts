import type { Tool, ToolStatus, ToolWithAvailability, ToolKindWithAvailability, Loan, Reservation } from "@/lib/types";
import { formatAvailableFromLabel } from "@/lib/dates";

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

function aggregateAvailability(
  units: Tool[],
  loanByTool: Map<string, Loan>,
  reservationByTool: Map<string, Reservation>
): Pick<ToolWithAvailability, "availableFrom" | "availabilityLabel"> {
  const unavailable = units.filter((t) => t.status !== "available");
  if (unavailable.length === 0) return {};

  let earliest: string | undefined;
  for (const tool of unavailable) {
    let availableFrom: string | undefined;
    if (tool.status === "on_loan") {
      availableFrom = loanByTool.get(tool.id)?.dueReturnDate;
    } else if (tool.status === "reserved") {
      availableFrom = reservationByTool.get(tool.id)?.returnDate;
    }
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
  reservationByTool: Map<string, Reservation>,
  extras?: Partial<ToolWithAvailability>
): ToolKindWithAvailability | null {
  if (units.length === 0) return null;

  const representative = units[0];
  const kindId = representative.kindId ?? representative.id;
  const availableUnits = units.filter((t) => t.status === "available").length;
  const status: ToolStatus = availableUnits > 0 ? "available" : representative.status;

  return {
    catalogId: kindId,
    kindId,
    name: representative.name,
    description: representative.description,
    category: representative.category,
    loanFeeMin: representative.loanFeeMin,
    loanFeeMax: representative.loanFeeMax,
    safetyRules: representative.safetyRules,
    imageUrl: representative.imageUrl,
    gemachId: representative.gemachId,
    status,
    totalUnits: units.length,
    availableUnits,
    representativeToolId: pickAvailableUnit(units)?.id ?? representative.id,
    ...aggregateAvailability(units, loanByTool, reservationByTool),
    ...extras,
  };
}

export function inventoryLabel(kind: Pick<ToolKindWithAvailability, "totalUnits" | "availableUnits">): string | undefined {
  if (kind.totalUnits <= 1) return undefined;
  if (kind.availableUnits > 0) {
    return `${kind.availableUnits} מתוך ${kind.totalUnits} זמינים`;
  }
  return `${kind.totalUnits} יחידות — אין זמינות כרגע`;
}
