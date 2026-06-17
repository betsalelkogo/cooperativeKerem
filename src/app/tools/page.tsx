import { ToolCard } from "@/components/tools/ToolCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAllTools } from "@/lib/firestore/repository";

export default async function ToolsPage() {
  const tools = await getAllTools();
  const available = tools.filter((t) => t.status === "available").length;

  return (
    <div>
      <PageHeader
        title="כלים זמינים"
        description="בחרו כלי לשריון ואיסוף מהקרוואן הקהילתי."
        action={
          <div className="rounded-xl bg-kerem-50 px-4 py-2 text-center ring-1 ring-kerem-200">
            <p className="text-2xl font-bold text-kerem-800">{available}</p>
            <p className="text-xs font-medium text-kerem-600">זמינים עכשיו</p>
          </div>
        }
      />
      {tools.length === 0 ? (
        <p className="text-center text-[var(--muted)]">
          אין כלים במערכת. הריצו <code className="rounded bg-warm-100 px-1">npm run seed</code>.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
