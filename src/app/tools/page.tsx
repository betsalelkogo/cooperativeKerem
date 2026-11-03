import { CatalogLoader } from "@/components/tools/CatalogLoader";
import { AddGemachPromo } from "@/components/gemach/AddGemachPromo";
import { CaravanCodeBanner } from "@/components/access/CaravanCodeBanner";
import { SiteLogo } from "@/components/layout/SiteLogo";
import { YardBand } from "@/components/brand/Marks";

export default function ToolsPage() {
  return (
    <div>
      <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#fbf7f0]">
        <div className="flex items-center gap-4 px-5 pt-5 sm:px-6">
          <SiteLogo size="md" />
          <div>
            <h1 className="text-3xl font-bold text-stone-900">כלים זמינים</h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              בחרו כלי לשריון ואיסוף מהקרוואן הקהילתי.
            </p>
          </div>
        </div>
        <YardBand className="mt-4 h-24 w-full" />
      </section>

      <AddGemachPromo />
      <CaravanCodeBanner />
      <CatalogLoader />
    </div>
  );
}
