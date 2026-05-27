import { ImageAiProcessingManager } from "@/components/image-ai-processing-manager";
import { PageShell } from "@/components/page-shell";

export default function PrintExtractionPage() {
  return (
    <PageShell title="印花提取" description="从商品图中自动提取印花图，输出可用于套图的透明底图片。">
      <ImageAiProcessingManager kind="print_extraction" />
    </PageShell>
  );
}
