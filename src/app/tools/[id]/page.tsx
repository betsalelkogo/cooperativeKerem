import { notFound } from "next/navigation";
import Link from "next/link";
import { getToolWithAvailability } from "@/lib/firestore/repository";
import { formatNIS } from "@/lib/pots";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BackLink } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tool = await getToolWithAvailability(id);
  if (!tool) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/tools">חזרה לכלים</BackLink>

      <Card className="overflow-hidden shadow-md">
        <div className="h-2 bg-gradient-to-l from-kerem-500 to-kerem-700" />
        <CardBody className="py-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                {tool.category}
              </p>
              <h1 className="mt-1 text-3xl font-bold text-stone-900">{tool.name}</h1>
            </div>
            <StatusBadge status={tool.status} />
          </div>
          {tool.availabilityLabel && tool.status !== "available" && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              {tool.availabilityLabel}
              {tool.availableFrom && (
                <span className="mr-2 text-amber-700">
                  ({new Date(`${tool.availableFrom}T00:00:00`).toLocaleDateString("he-IL")})
                </span>
              )}
            </p>
          )}
          <p className="mb-6 leading-relaxed text-[var(--muted)]">{tool.description}</p>

          <div className="mb-6 rounded-xl bg-kerem-50 p-5 ring-1 ring-kerem-200">
            <p className="text-sm font-semibold text-kerem-800">דמי השאלה</p>
            <p className="mt-1 text-2xl font-bold text-kerem-700">
              {formatNIS(tool.loanFeeMin)}–{formatNIS(tool.loanFeeMax)}
            </p>
            <p className="mt-2 text-xs text-kerem-600">
              נגבים בעת הלקיחה · מתחלקים בין תחזוקת הכלי לתפעול הקואופרטיב
            </p>
          </div>

          <div className="mb-6">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-stone-900">
              <span>⚠️</span> כללי בטיחות
            </h2>
            <ul className="space-y-2">
              {tool.safetyRules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2 text-sm text-stone-700"
                >
                  <span className="mt-0.5 text-kerem-600">•</span>
                  {rule.text}
                </li>
              ))}
            </ul>
          </div>

          {tool.status === "available" && (
            <Link
              href={`/tools/${tool.id}/reserve`}
              className="inline-flex w-full items-center justify-center rounded-xl bg-kerem-700 py-3.5 text-base font-bold text-white shadow-md shadow-kerem-700/25 transition hover:bg-kerem-800 sm:w-auto sm:px-8"
            >
              שריון הכלי
            </Link>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
