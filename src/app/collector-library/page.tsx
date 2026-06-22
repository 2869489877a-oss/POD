import { CollectorLibraryManager } from "@/components/collector-library-manager";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function CollectorLibraryPage() {
  return (
    <PageShell
      titleZh="图片采集库"
      titleEn="Collector Library"
      descriptionZh="集中审核浏览器插件采集的图片，合格的入素材库，不合格的直接删除。"
      descriptionEn="Review images sent from the browser collector, import approved files into Assets, and delete rejected files."
    >
      <CollectorLibraryManager />
    </PageShell>
  );
}
