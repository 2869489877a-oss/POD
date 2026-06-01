import { AiBackgroundGenerator } from "@/components/ai-background-generator";
import { AiImageGenerator } from "@/components/ai-image-generator";
import { AiPatternGenerator } from "@/components/ai-pattern-generator";
import { AiPrintExtractor } from "@/components/ai-print-extractor";
import { PageShell } from "@/components/page-shell";
import { AiImageTabs } from "@/components/ai-image-tabs";

export const dynamic = "force-dynamic";

export default function AiImagePage() {
  return (
    <PageShell title="AI 图片工作台" description="AI 生图、抠图换背景、抠印花、生成印花。支持 Gemini、GPT、豆包、通义万相多模型。模型配置请前往「设置」页面。">
      <AiImageTabs
        generateTab={<AiImageGenerator />}
        backgroundTab={<AiBackgroundGenerator />}
        extractTab={<AiPrintExtractor />}
        patternTab={<AiPatternGenerator />}
      />
    </PageShell>
  );
}
