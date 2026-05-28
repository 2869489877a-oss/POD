import { ImageCollectorManager } from "@/components/image-collector-manager";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function ImageCollectorPage() {
  return (
    <PageShell
      title="图片采集"
      description="配置网站来源、关键词、保存目录和运行频率，第一阶段支持模板管理和手动运行记录。"
    >
      <ImageCollectorManager />
    </PageShell>
  );
}
