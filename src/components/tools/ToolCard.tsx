import Link from "next/link";
import type { ToolKindWithAvailability } from "@/lib/types";
import { inventoryLabel } from "@/lib/tool-kinds";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { ToolBorrowActions } from "@/components/tools/ToolBorrowActions";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { cn } from "@/lib/cn";

export function ToolCard({ kind }: { kind: ToolKindWithAvailability }) {
  const priceLabel = kind.priceLabel ?? "—";
  const stockLabel = inventoryLabel(kind);

  return (
    <Card className="group overflow-hidden transition-colors hover:border-kerem-200">
      {kind.imageUrl ? (
        <div className="relative h-36 overflow-hidden bg-warm-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={kind.imageUrl}
            alt={kind.name}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="h-1 bg-kerem-600" />
      )}
      <CardBody className="pb-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {kind.category}
              </p>
              {kind.gemachName && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
                    kind.isPartnerGemach
                      ? "bg-accent-50 text-accent-800 ring-accent-100"
                      : "bg-kerem-100 text-kerem-800 ring-kerem-200"
                  )}
                >
                    {kind.gemachName}
                </span>
              )}
              {kind.totalUnits > 1 && (
                <span className="rounded-full bg-kerem-50 px-2 py-0.5 text-[10px] font-bold text-kerem-800 ring-1 ring-inset ring-kerem-200">
                  {kind.totalUnits} יחידות
                </span>
              )}
            </div>
            <h3 className="mt-1 text-lg font-bold text-stone-900">
              <Link
                href={`/tools/${kind.catalogId}`}
                className="hover:text-kerem-800 hover:underline"
              >
                {kind.name}
              </Link>
            </h3>
          </div>
          <StatusBadge status={kind.status} />
        </div>
        <ExpandableText
          text={kind.description}
          lines={3}
          className="text-sm text-[var(--muted)]"
        />
        {!kind.isPartnerGemach && kind.youtubeUrl && (
          <a
            href={kind.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-kerem-700 transition hover:text-kerem-800 hover:underline"
          >
            סרטון הדרכה
          </a>
        )}
        {kind.location && (
          <p className="mt-2 text-xs text-stone-600">{kind.location}</p>
        )}
        {stockLabel && (
          <p className="mt-2 text-xs font-semibold text-kerem-800">{stockLabel}</p>
        )}
      </CardBody>
      <CardFooter className="flex flex-col gap-3 bg-warm-50/60 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-[var(--muted)]">
            {kind.gemachPricingMode === "free" ? "מחיר" : "דמי השאלה"}
          </p>
          <p
            className={cn(
              "font-bold",
              kind.gemachPricingMode === "free" ? "text-kerem-700" : "text-kerem-800"
            )}
          >
            {priceLabel}
          </p>
        </div>
        <ToolBorrowActions kind={kind} variant="card" />
      </CardFooter>
    </Card>
  );
}
