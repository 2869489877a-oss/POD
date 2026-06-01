import { AiBackgroundGenerator } from "@/components/ai-background-generator";
import { AiImageGenerator } from "@/components/ai-image-generator";
import { AiPatternGenerator } from "@/components/ai-pattern-generator";
import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";
import { AiImageTabs } from "@/components/ai-image-tabs";

export const dynamic = "force-dynamic";

export default function AiImagePage() {
  return (
    <PageShell title="AI 生图" description="使用 AI 模型生成图片，支持 Gemini、GPT、豆包、通义万相。可与抠图、印花提取等功能联动。">
      <AiImageTabs
        generateTab={<AiImageGenerator />}
        backgroundTab={<AiBackgroundGenerator />}
        patternTab={<AiPatternGenerator />}
      />
      <div className="mt-8 border-t border-slate-200 pt-8">
        <AiProvidersManager />
      </div>
    </PageShell>
  );
}
