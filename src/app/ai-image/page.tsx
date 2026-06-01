import { AiImageGenerator } from "@/components/ai-image-generator";
import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function AiImagePage() {
  return (
    <PageShell title="AI 生图" description="使用 AI 模型生成图片，支持 Gemini、GPT、豆包、通义万相等多家平台。">
      <AiImageGenerator />
      <div className="mt-8 border-t border-slate-200 pt-8">
        <AiProvidersManager />
      </div>
    </PageShell>
  );
}
