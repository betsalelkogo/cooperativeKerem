import Link from "next/link";
import type { ToolWithAvailability } from "@/lib/types";
import { formatNIS } from "@/lib/pots";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const categoryMeta: Record<string, { icon: string; gradient: string }> = {
  "כלי עבודה חשמליים": { icon: "⚡", gradient: "from-amber-400 to-orange-500" },
  ניקוי: { icon: "💧", gradient: "from-sky-400 to-blue-500" },
  גישה: { icon: "🪜", gradient: "from-violet-400 to-purple-500" },
};

const defaultMeta = { icon: "🔧", gradient: "from-kerem-400 to-kerem-600" };

export function ToolCard({ tool }: { tool: ToolWithAvailability }) {
  const meta = categoryMeta[tool.category] ?? defaultMeta;

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
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {tool.category}
              </p>
              <h3 className="text-lg font-bold text-stone-900">{tool.name}</h3>
            </div>
          </div>
          <StatusBadge status={tool.status} />
        </div>
        <p className="text-sm leading-relaxed text-[var(--muted)]">{tool.description}</p>
      </CardBody>
      <CardFooter className="flex items-center justify-between bg-warm-50/50">
        <div>
          <p className="text-xs text-[var(--muted)]">דמי השאלה</p>
          <p className="font-bold text-kerem-700">
            {formatNIS(tool.loanFeeMin)}–{formatNIS(tool.loanFeeMax)}
          </p>
        </div>
        {tool.status === "available" ? (
          <Link
            href={`/tools/${tool.id}/reserve`}
            className="rounded-xl bg-kerem-700 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-kerem-700/20 transition hover:bg-kerem-800 group-hover:shadow-lg"
          >
            שריון
          </Link>
        ) : (
          <div className="text-left">
            <span className="block text-sm text-[var(--muted)]">לא זמין</span>
            {tool.availabilityLabel && (
              <span className="mt-0.5 block text-xs font-semibold text-amber-700">
                {tool.availabilityLabel}
              </span>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
