import { ImageAiProcessingManager } from "@/components/image-ai-processing-manager";
import { PageShell } from "@/components/page-shell";

export default function CutoutPage() {
  return (
    <PageShell title="一键抠图" description="从素材库选择图片，批量生成透明底 PNG 抠图结果。">
      <ImageAiProcessingManager kind="cutout" />
    </PageShell>
  );
}
