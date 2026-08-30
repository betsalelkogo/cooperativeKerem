import { CatalogLoader } from "@/components/tools/CatalogLoader";
import { AddGemachPromo } from "@/components/gemach/AddGemachPromo";
import { CaravanCodeBanner } from "@/components/access/CaravanCodeBanner";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ToolsPage() {
  return (
    <div>
      <PageHeader
        title="כלים זמינים"
        description="בחרו כלי לשריון ואיסוף מהקרוואן הקהילתי."
      />

      <AddGemachPromo />
      <CaravanCodeBanner />
      <CatalogLoader />
    </div>
  );
}
