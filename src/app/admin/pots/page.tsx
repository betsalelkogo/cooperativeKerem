import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { PayboxPayoutPanel } from "@/components/admin/PayboxPayoutPanel";
import { getPayboxSettings, getPotsOverview } from "@/lib/firestore/repository";
import { formatNIS, groupPotsByKind, splitPayment } from "@/lib/pots";

export const dynamic = "force-dynamic";

export default async function AdminPotsPage() {
  const { tools, devicePots, operationsPot, operationsPercent } = await getPotsOverview();
  const payboxSettings = await getPayboxSettings();
  const deviceBalances = Object.fromEntries(
    devicePots.map((p) => [p.toolId ?? p.id, p.balance])
  );

  return (
    <div>
      <PageHeader
        title="קופות"
        description={`ניתוב כספים חכם: ${operationsPercent}% לתפעול, ${100 - operationsPercent}% לכל מכשיר.`}
      />

      <PayboxPayoutPanel
        tools={tools}
        operationsBalance={operationsPot.balance}
        deviceBalances={deviceBalances}
        payboxEnabled={payboxSettings.enabled}
      />

      <Card className="mb-8 overflow-hidden border-kerem-200 shadow-md">
        <div className="bg-gradient-to-l from-kerem-700 to-kerem-900 px-6 py-6 text-white">
          <p className="text-sm font-medium text-kerem-200">קופת תפעול כללית</p>
          <p className="mt-1 text-4xl font-bold">{formatNIS(operationsPot.balance)}</p>
        </div>
        <CardBody>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            תחזוקת האתר · חשמל ואינטרנט לקרוואן · שדרוגי אבטחה · חומרי ניקוי
          </p>
        </CardBody>
      </Card>

      <h2 className="mb-4 text-xl font-bold text-stone-900">קופות מכשירים</h2>
      {tools.length === 0 ? (
        <p className="text-[var(--muted)]">אין כלים. הריצו npm run seed.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groupPotsByKind(tools, devicePots).map((row) => {
            const split = splitPayment(row.loanFeeMin, operationsPercent);
            return (
              <Card key={row.kindId} className="transition hover:shadow-md">
                <CardBody>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {row.category}
                  </p>
                  <h3 className="mt-1 font-bold text-stone-900">
                    {row.name}
                    {row.units > 1 && (
                      <span className="mr-2 rounded-full bg-kerem-100 px-2 py-0.5 text-xs font-bold text-kerem-800">
                        {row.units} יחידות
                      </span>
                    )}
                  </h3>
                  <p className="mt-3 text-3xl font-bold text-kerem-700">{formatNIS(row.balance)}</p>
                  <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
                    <p>
                      לכלי (ליחידה):{" "}
                      <span className="font-semibold text-stone-700">
                        {formatNIS(split.deviceAmount)}
                      </span>
                    </p>
                    <p>
                      לתפעול (ליחידה):{" "}
                      <span className="font-semibold text-stone-700">
                        {formatNIS(split.operationsAmount)}
                      </span>
                    </p>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
