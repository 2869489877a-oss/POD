import { ImageAiProcessingManager } from "@/components/image-ai-processing-manager";
import { PageShell } from "@/components/page-shell";

export default function CutoutPage() {
  return (
    <PageShell
      titleZh="一键抠图"
      titleEn="Cutout"
      descriptionZh="从素材库选择图片，批量生成透明底 PNG 抠图结果。"
      descriptionEn="Select assets and batch-generate transparent PNG cutout results."
    >
      <ImageAiProcessingManager kind="cutout" />
    </PageShell>
  );
}
