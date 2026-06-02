import { ImageCollectorManager } from "@/components/image-collector-manager";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function ImageCollectorPage() {
  return (
    <PageShell
      titleZh="图片采集"
      titleEn="Image Collector"
      descriptionZh="配置网站来源、关键词、保存目录和运行频率，第一阶段支持模板管理和手动运行记录。"
      descriptionEn="Configure website sources, keywords, storage paths, and run frequency. The first stage supports template management and manual run history."
    >
      <ImageCollectorManager />
    </PageShell>
  );
}
