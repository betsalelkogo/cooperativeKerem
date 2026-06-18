import { ToolsCatalog } from "@/components/tools/ToolsCatalog";
import { AddGemachPromo } from "@/components/gemach/AddGemachPromo";
import { PageHeader } from "@/components/ui/PageHeader";
import { getToolKindsWithAvailability, getAllGemachim } from "@/lib/firestore/repository";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const [kinds, gemachim] = await Promise.all([
    getToolKindsWithAvailability(),
    getAllGemachim(),
  ]);

  return (
    <div>
      <PageHeader
        title="כלים זמינים"
        description="בחרו כלי לשריון ואיסוף מהקרוואן הקהילתי."
      />

      <AddGemachPromo />

      {kinds.length === 0 ? (
        <p className="text-center text-[var(--muted)]">
          אין כלים במערכת. הריצו <code className="rounded bg-warm-100 px-1">npm run seed</code>.
        </p>
      ) : (
        <ToolsCatalog kinds={kinds} gemachim={gemachim} />
      )}
    </div>
  );
}
