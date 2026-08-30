import type { ToolStatus } from "@/lib/types";
import { toolStatusLabels } from "@/lib/labels";
import { cn } from "@/lib/cn";

const statusStyles: Record<ToolStatus, string> = {
  available: "bg-kerem-100 text-kerem-800 ring-kerem-200",
  reserved: "bg-accent-50 text-accent-800 ring-accent-100",
  on_loan: "bg-warm-100 text-stone-700 ring-warm-200",
  maintenance: "bg-accent-100 text-accent-800 ring-accent-100",
  disabled: "bg-red-100 text-red-800 ring-red-200",
};

export function StatusBadge({ status }: { status: ToolStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset",
        statusStyles[status]
      )}
    >
      {toolStatusLabels[status]}
    </span>
  );
}
