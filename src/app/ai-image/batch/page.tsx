import { AiBatchPrintGenerator } from "@/components/ai-batch-print-generator";
import { AiImageBatchNav } from "@/components/ai-image-batch-nav";
import { AiGridPrintGenerator } from "@/components/ai-grid-print-generator";
import { PageShell } from "@/components/page-shell";

export default function AiImageBatchPage() {
  return (
    <PageShell
      titleZh="批量 AI 提取印花"
      titleEn="Batch AI Print Extraction"
      descriptionZh="支持 2x2 四图和 3x3 九图拼图剪图，一次提交给 AI 提取印花；也支持多张图片逐张队列生成。"
      descriptionEn="Crop and combine garment images into one grid AI extraction, or run one-output-per-source batch queues."
    >
      <div className="space-y-6">
        <AiImageBatchNav />
        <AiGridPrintGenerator gridSize={2} />
        <AiGridPrintGenerator gridSize={3} />
        <AiBatchPrintGenerator />
      </div>
    </PageShell>
  );
}
