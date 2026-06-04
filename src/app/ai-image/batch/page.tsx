import { AiBatchPrintGenerator } from "@/components/ai-batch-print-generator";
import { PageShell } from "@/components/page-shell";

export default function AiImageBatchPage() {
  return (
    <PageShell
      titleZh="批量 AI 提取印花"
      titleEn="Batch AI Print Extraction"
      descriptionZh="多张衣服图按队列逐张生成印花图，一张原图对应一张结果图，成功结果会自动保存到素材库。"
      descriptionEn="Queue multiple garment images and generate one print output per source image. Successful results are saved to Assets automatically."
    >
      <AiBatchPrintGenerator />
    </PageShell>
  );
}
