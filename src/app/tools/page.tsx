import { ToolCard } from "@/components/tools/ToolCard";
import { AddGemachPromo } from "@/components/gemach/AddGemachPromo";
import { PageHeader } from "@/components/ui/PageHeader";
import { getToolKindsWithAvailability } from "@/lib/firestore/repository";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const kinds = await getToolKindsWithAvailability();
  const availableUnits = kinds.reduce((sum, k) => sum + k.availableUnits, 0);

  return (
    <div>
      <PageHeader
        title="כלים זמינים"
        description="בחרו כלי לשריון ואיסוף מהקרוואן הקהילתי."
        action={
          <div className="rounded-xl bg-kerem-50 px-4 py-2 text-center ring-1 ring-kerem-200">
            <p className="text-2xl font-bold text-kerem-800">{availableUnits}</p>
            <p className="text-xs font-medium text-kerem-600">יחידות זמינות</p>
          </div>
        }
      />

      <AddGemachPromo />

      {kinds.length === 0 ? (
        <p className="text-center text-[var(--muted)]">
          אין כלים במערכת. הריצו <code className="rounded bg-warm-100 px-1">npm run seed</code>.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {kinds.map((kind) => (
            <ToolCard key={`${kind.gemachId}:${kind.kindId}`} kind={kind} />
          ))}
        </div>
      )}
    </div>
  );
}
