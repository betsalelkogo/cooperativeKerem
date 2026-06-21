"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Alert } from "@/components/ui/Alert";
import { authFetch } from "@/lib/api-client";
import { buildGemachFilterOptions, PLATFORM_GEMACH_ID } from "@/lib/gemach";
import type { AdminDashboardToolKindRow, Gemach } from "@/lib/types";

interface AdminToolKindsTableProps {
  tools: AdminDashboardToolKindRow[];
  showGemachColumn?: boolean;
  editable?: boolean;
  /** When set, edit/status actions only appear for this gemach's tools. */
  cooperativeOnly?: boolean;
  gemachId?: string;
  gemachim?: Gemach[];
  getToken: () => Promise<string | null>;
  onUpdated?: () => void;
}

export function AdminToolKindsTable({
  tools,
  showGemachColumn = false,
  editable = false,
  cooperativeOnly = false,
  gemachId,
  gemachim = [],
  getToken,
  onUpdated,
}: AdminToolKindsTableProps) {
  const [expandedKind, setExpandedKind] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [selectedGemachId, setSelectedGemachId] = useState("");

  const filterOptions = useMemo(
    () =>
      showGemachColumn
        ? buildGemachFilterOptions(
            tools.map((t) => ({
              gemachId: t.gemachId,
              gemachName: t.gemachName,
              isPartnerGemach: t.gemachId !== PLATFORM_GEMACH_ID,
            })),
            gemachim
          )
        : [],
    [tools, gemachim, showGemachColumn]
  );

  const filteredTools =
    !showGemachColumn || selectedGemachId === ""
      ? tools
      : tools.filter((t) => t.gemachId === selectedGemachId);

  const selectedHasNoTools =
    selectedGemachId !== "" &&
    filteredTools.length === 0 &&
    filterOptions.some((o) => o.gemachId === selectedGemachId);

  async function updateKindStatus(kindId: string, status: "available" | "disabled" | "maintenance") {
    if (!gemachId) return;
    setLoadingKey(`${kindId}:${status}`);
    setError("");
    try {
      const token = await getToken();
      const res = await authFetch("/api/admin/gemach/tools/status", {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemachId, kindId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "עדכון נכשל");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoadingKey(null);
    }
  }

  async function updateUnitStatus(toolId: string, status: "available" | "disabled" | "maintenance") {
    if (!gemachId) return;
    setLoadingKey(`${toolId}:${status}`);
    setError("");
    try {
      const token = await getToken();
      const res = await authFetch("/api/admin/gemach/tools/status", {
        method: "PATCH",
        token,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemachId, toolId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "עדכון נכשל");
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <section className="mb-10">
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}
      <h2 className="mb-4 text-lg font-bold text-stone-900">כלים — מצב נוכחי</h2>
      {showGemachColumn && filterOptions.length > 1 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <label
              htmlFor="admin-tools-gemach-filter"
              className="mb-1.5 block text-sm font-bold text-stone-900"
            >
              סינון לפי גמ״ח
            </label>
            <select
              id="admin-tools-gemach-filter"
              value={selectedGemachId}
              onChange={(e) => {
                setSelectedGemachId(e.target.value);
                setExpandedKind(null);
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-stone-800 focus:border-kerem-500 focus:outline-none focus:ring-2 focus:ring-kerem-200"
            >
              <option value="">כל הגמ״חים</option>
              {filterOptions.map((option) => (
                <option key={option.gemachId} value={option.gemachId}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {selectedGemachId !== "" && (
            <p className="text-sm text-[var(--muted)]">
              מציג {filteredTools.length} מתוך {tools.length} סוגי כלים
            </p>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-warm-50 text-right">
              <th className="px-4 py-3 font-semibold text-stone-700">כלי</th>
              {showGemachColumn && (
                <th className="px-4 py-3 font-semibold text-stone-700">גמ״ח</th>
              )}
              <th className="px-4 py-3 font-semibold text-stone-700">קטגוריה</th>
              <th className="px-4 py-3 font-semibold text-stone-700">מלאי</th>
              <th className="px-4 py-3 font-semibold text-stone-700">סטטוס</th>
              {editable && (
                <th className="px-4 py-3 font-semibold text-stone-700">פעולות</th>
              )}
            </tr>
          </thead>
          <tbody>
            {tools.length === 0 ? (
              <tr>
                <td
                  colSpan={(showGemachColumn ? 5 : 4) + (editable ? 1 : 0)}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  אין כלים במערכת
                </td>
              </tr>
            ) : selectedHasNoTools ? (
              <tr>
                <td
                  colSpan={(showGemachColumn ? 5 : 4) + (editable ? 1 : 0)}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  לגמ״ח זה עדיין לא נוספו כלים.
                </td>
              </tr>
            ) : filteredTools.length === 0 ? (
              <tr>
                <td
                  colSpan={(showGemachColumn ? 5 : 4) + (editable ? 1 : 0)}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  אין כלים התואמים את הסינון.
                </td>
              </tr>
            ) : (
              filteredTools.map((tool) => {
                const isExpanded = expandedKind === tool.kindId;
                const busy = loadingKey?.startsWith(tool.kindId);
                const canEdit =
                  editable &&
                  (!cooperativeOnly || tool.gemachId === PLATFORM_GEMACH_ID);
                const actionGemachId = gemachId ?? tool.gemachId;
                return (
                  <Fragment key={tool.kindId}>
                    <tr className="border-b border-[var(--border)]">
                      <td className="px-4 py-3 font-medium text-stone-900">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedKind(isExpanded ? null : tool.kindId)
                          }
                          className="text-right hover:text-kerem-700"
                        >
                          {tool.name}
                          {tool.totalUnits > 1 && (
                            <span className="mr-2 text-xs text-[var(--muted)]">
                              ({isExpanded ? "▲" : "▼"} {tool.totalUnits} יחידות)
                            </span>
                          )}
                        </button>
                      </td>
                      {showGemachColumn && (
                        <td className="px-4 py-3 text-[var(--muted)]">
                          {tool.gemachName ?? "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-[var(--muted)]">{tool.category}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {tool.availableUnits}/{tool.totalUnits} זמינים
                        {tool.onLoanUnits > 0 && (
                          <span className="mr-2 text-sky-700">· {tool.onLoanUnits} מושאלים</span>
                        )}
                        {tool.reservedUnits > 0 && (
                          <span className="mr-2 text-amber-700">· {tool.reservedUnits} שמורים</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={tool.status} />
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Link
                              href={
                                cooperativeOnly
                                  ? `/admin/tools/${encodeURIComponent(tool.kindId)}/edit`
                                  : `/admin/gemach/tools/${encodeURIComponent(tool.kindId)}/edit?gemachId=${encodeURIComponent(actionGemachId)}`
                              }
                              className="rounded-lg bg-kerem-50 px-2 py-1 text-xs font-semibold text-kerem-800 hover:bg-kerem-100"
                            >
                              ערוך
                            </Link>
                            {tool.availableUnits > 0 && (
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => updateKindStatus(tool.kindId, "disabled")}
                                className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                לא זמין
                              </button>
                            )}
                            {(tool.disabledUnits > 0 || tool.maintenanceUnits > 0) && (
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => updateKindStatus(tool.kindId, "available")}
                                className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                החזר לזמין
                              </button>
                            )}
                            {tool.availableUnits > 0 && (
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => updateKindStatus(tool.kindId, "maintenance")}
                                className="rounded-lg bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                              >
                                תחזוקה
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {editable && !canEdit && <td className="px-4 py-3" />}
                    </tr>
                    {isExpanded &&
                      tool.units.map((unit) => (
                        <tr
                          key={unit.id}
                          className="border-b border-[var(--border)] bg-warm-50/50"
                        >
                          <td className="px-4 py-2 pr-8 text-[var(--muted)]">
                            {unit.unitLabel ?? unit.id}
                            {unit.borrowerName && (
                              <span className="mr-2 text-xs">— {unit.borrowerName}</span>
                            )}
                          </td>
                          {showGemachColumn && <td />}
                          <td />
                          <td />
                          <td className="px-4 py-2">
                            <StatusBadge status={unit.status} />
                          </td>
                          {canEdit && (
                            <td className="px-4 py-2">
                              {(unit.status === "available" ||
                                unit.status === "disabled" ||
                                unit.status === "maintenance") && (
                                <div className="flex flex-wrap gap-1">
                                  {unit.status !== "available" && (
                                    <button
                                      type="button"
                                      disabled={loadingKey === `${unit.id}:available`}
                                      onClick={() => updateUnitStatus(unit.id, "available")}
                                      className="rounded px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-50"
                                    >
                                      זמין
                                    </button>
                                  )}
                                  {unit.status === "available" && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={loadingKey === `${unit.id}:disabled`}
                                        onClick={() => updateUnitStatus(unit.id, "disabled")}
                                        className="rounded px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                                      >
                                        לא זמין
                                      </button>
                                      <button
                                        type="button"
                                        disabled={loadingKey === `${unit.id}:maintenance`}
                                        onClick={() => updateUnitStatus(unit.id, "maintenance")}
                                        className="rounded px-2 py-0.5 text-xs text-orange-700 hover:bg-orange-50"
                                      >
                                        תחזוקה
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          {editable && !canEdit && <td className="px-4 py-2" />}
                        </tr>
                      ))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
