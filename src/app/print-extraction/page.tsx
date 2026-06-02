import { ImageAiProcessingManager } from "@/components/image-ai-processing-manager";
import { PageShell } from "@/components/page-shell";

export default function PrintExtractionPage() {
  return (
    <PageShell
      titleZh="印花提取"
      titleEn="Print Extract"
      descriptionZh="从商品图中自动提取印花图，输出可用于套图的透明底图片。"
      descriptionEn="Extract print artwork from product images and output transparent-background images for mockups."
    >
      <ImageAiProcessingManager kind="print_extraction" />
    </PageShell>
  );
}
