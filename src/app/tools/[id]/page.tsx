import { notFound } from "next/navigation";
import Link from "next/link";
import { getToolKindWithAvailability } from "@/lib/firestore/repository";
import { inventoryLabel } from "@/lib/tool-kinds";
import { formatNIS } from "@/lib/pots";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BackLink } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { ToolImageGallery } from "@/components/tools/ToolImageGallery";
import { InstantLoanButton } from "@/components/tools/InstantLoanButton";

export const dynamic = "force-dynamic";

function popularityLabel(totalLoans: number): string | null {
  if (totalLoans >= 20) return "פופולרי מאוד";
  if (totalLoans >= 5) return "מבוקש";
  return null;
}

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kind = await getToolKindWithAvailability(id);
  if (!kind) notFound();

  const stockLabel = inventoryLabel(kind);
  const priceText =
    kind.priceLabel ??
    (kind.loanFeeMin === kind.loanFeeMax
      ? formatNIS(kind.loanFeeMin)
      : `${formatNIS(kind.loanFeeMin)}–${formatNIS(kind.loanFeeMax)}`);

  const stats = kind.stats ?? { totalLoans: 0, activeLoans: 0, uniqueBorrowers: 0 };
  const popular = popularityLabel(stats.totalLoans);

  const specRows = [
    { label: "מיקום", value: kind.location },
    { label: "מותג", value: kind.brand },
    { label: "ספק", value: kind.supplier },
    { label: "גיל מוצר", value: kind.productAge !== undefined ? `${kind.productAge} שנים` : undefined },
  ].filter((r) => r.value);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink href="/tools">חזרה לכלים</BackLink>

      <Card className="overflow-hidden shadow-md">
        <div className="h-2 bg-gradient-to-l from-kerem-500 to-kerem-700" />
        <CardBody className="py-6">
          <ToolImageGallery
            imageUrl={kind.imageUrl}
            imageUrls={kind.imageUrls}
            alt={kind.name}
          />

          <div className="mb-5 mt-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                  {kind.category}
                </p>
                {popular && (
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-800 ring-1 ring-violet-200">
                    ★ {popular}
                  </span>
                )}
              </div>
              <h1 className="mt-1 text-3xl font-bold text-stone-900">{kind.name}</h1>
              {kind.gemachName && (
                <p className="mt-1 text-sm text-amber-800">{kind.gemachName}</p>
              )}
              {kind.totalUnits > 1 && (
                <p className="mt-2 text-sm font-medium text-sky-700">
                  {kind.totalUnits} יחידות במלאי
                  {kind.availableUnits > 0 && ` · ${kind.availableUnits} זמינות עכשיו`}
                </p>
              )}
            </div>
            <StatusBadge status={kind.status} />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-warm-50 p-3 text-center text-sm ring-1 ring-[var(--border)]">
            <div>
              <p className="font-bold text-stone-900">{stats.totalLoans}</p>
              <p className="text-xs text-[var(--muted)]">השאלות</p>
            </div>
            <div>
              <p className="font-bold text-stone-900">{stats.activeLoans}</p>
              <p className="text-xs text-[var(--muted)]">פעילות עכשיו</p>
            </div>
            <div>
              <p className="font-bold text-stone-900">{stats.uniqueBorrowers}</p>
              <p className="text-xs text-[var(--muted)]">שואלים שונים</p>
            </div>
          </div>

          {stockLabel && kind.availableUnits === 0 && (
            <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
              {stockLabel}
              {kind.availableFrom && (
                <span className="mr-2 text-amber-700">
                  ({new Date(`${kind.availableFrom}T00:00:00`).toLocaleDateString("he-IL")})
                </span>
              )}
            </p>
          )}

          <p className="mb-4 leading-relaxed text-stone-700">{kind.description}</p>

          {kind.purpose && (
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3">
              <p className="text-xs font-bold text-sky-900">ייעוד מומלץ</p>
              <p className="mt-1 text-sm text-stone-800">{kind.purpose}</p>
            </div>
          )}

          {specRows.length > 0 && (
            <dl className="mb-6 grid gap-3 rounded-xl bg-warm-50 p-4 ring-1 ring-[var(--border)] sm:grid-cols-2">
              {specRows.map((row) => (
                <div key={row.label}>
                  <dt className="text-xs font-semibold text-[var(--muted)]">{row.label}</dt>
                  <dd className="text-sm font-medium text-stone-800">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mb-6 rounded-xl bg-kerem-50 p-5 ring-1 ring-kerem-200">
            <p className="text-sm font-semibold text-kerem-800">
              {kind.gemachPricingMode === "free" ? "מחיר" : "דמי השאלה"}
            </p>
            <p className="mt-1 text-2xl font-bold text-kerem-700">{priceText}</p>
            {kind.gemachPricingMode !== "free" && (
              <p className="mt-2 text-xs text-kerem-600">
                נגבים בעת הלקיחה · מתחלקים בין תחזוקת הכלי לתפעול הקואופרטיב
              </p>
            )}
          </div>

          {kind.safetyRules.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 flex items-center gap-2 font-bold text-stone-900">
                <span>⚠️</span> כללי בטיחות
              </h2>
              <ul className="space-y-2">
                {kind.safetyRules.map((rule) => (
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
          )}

          <div className="flex flex-wrap gap-3">
            {kind.availableUnits > 0 && (
              <>
                <Link
                  href={`/tools/${kind.catalogId}/reserve`}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-kerem-700 py-3.5 text-base font-bold text-white shadow-md shadow-kerem-700/25 transition hover:bg-kerem-800 sm:flex-none sm:px-8"
                >
                  שריון {kind.totalUnits > 1 ? "יחידות" : "הכלי"}
                </Link>
                <InstantLoanButton
                  kindId={kind.catalogId}
                  availableUnits={kind.availableUnits}
                />
              </>
            )}
          </div>
          {kind.availableUnits > 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              «השאלה מיידית» — דילוג על שלב השריון: הכלי נלקח עכשיו ומועבר ישירות לתשלום ולקיחה.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
