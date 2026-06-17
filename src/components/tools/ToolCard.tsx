import Link from "next/link";
import type { ToolKindWithAvailability } from "@/lib/types";
import { inventoryLabel } from "@/lib/tool-kinds";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const categoryMeta: Record<string, { icon: string; gradient: string }> = {
  "כלי עבודה חשמליים": { icon: "⚡", gradient: "from-amber-400 to-orange-500" },
  ניקוי: { icon: "💧", gradient: "from-sky-400 to-blue-500" },
  גישה: { icon: "🪜", gradient: "from-violet-400 to-purple-500" },
  "תינוקות וילדים": { icon: "👶", gradient: "from-pink-400 to-rose-500" },
};

const defaultMeta = { icon: "🔧", gradient: "from-kerem-400 to-kerem-600" };

export function ToolCard({ kind }: { kind: ToolKindWithAvailability }) {
  const meta = categoryMeta[kind.category] ?? defaultMeta;
  const priceLabel = kind.priceLabel ?? "—";
  const stockLabel = inventoryLabel(kind);

  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-stone-900/10">
      <div className={cn("h-1.5 bg-gradient-to-l", meta.gradient)} />
      <CardBody className="pb-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xl text-white shadow-md",
                meta.gradient
              )}
            >
              {meta.icon}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {kind.category}
                </p>
                {kind.isPartnerGemach && kind.gemachName && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                    ★ {kind.gemachName}
                  </span>
                )}
                {kind.totalUnits > 1 && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-inset ring-sky-200">
                    {kind.totalUnits} יחידות
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-stone-900">{kind.name}</h3>
            </div>
          </div>
          <StatusBadge status={kind.status} />
        </div>
        <p className="text-sm leading-relaxed text-[var(--muted)]">{kind.description}</p>
        {stockLabel && (
          <p className="mt-2 text-xs font-semibold text-sky-700">{stockLabel}</p>
        )}
      </CardBody>
      <CardFooter className="flex items-center justify-between bg-warm-50/50">
        <div>
          <p className="text-xs text-[var(--muted)]">
            {kind.gemachPricingMode === "free" ? "מחיר" : "דמי השאלה"}
          </p>
          <p
            className={cn(
              "font-bold",
              kind.gemachPricingMode === "free" ? "text-emerald-700" : "text-kerem-700"
            )}
          >
            {priceLabel}
          </p>
        </div>
        {kind.availableUnits > 0 ? (
          <Link
            href={`/tools/${kind.catalogId}/reserve`}
            className="rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-kerem-700/20 transition hover:bg-kerem-800 group-hover:shadow-lg"
          >
            שריון
          </Link>
        ) : (
          <div className="text-left">
            <span className="block text-sm text-[var(--muted)]">לא זמין</span>
            {kind.availabilityLabel && (
              <span className="mt-0.5 block text-xs font-semibold text-amber-700">
                {kind.availabilityLabel}
              </span>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
