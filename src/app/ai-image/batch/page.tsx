import { AiBatchPrintGenerator } from "@/components/ai-batch-print-generator";
import { AiGridPrintGenerator } from "@/components/ai-grid-print-generator";
import { PageShell } from "@/components/page-shell";

export default function AiImageBatchPage() {
  return (
    <PageShell
      titleZh="批量 AI 提取印花"
      titleEn="Batch AI Print Extraction"
      descriptionZh="四张衣服图可先裁剪并拼成 2x2，一次提交给 AI 提取印花；也支持多张图片逐张队列生成。"
      descriptionEn="Crop and combine four garment images into one 2x2 AI extraction, or run one-output-per-source batch queues."
    >
      <div className="space-y-6">
        <AiGridPrintGenerator />
        <AiBatchPrintGenerator />
      </div>
    </PageShell>
  );
}
