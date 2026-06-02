"use client";

import { AiBackgroundGenerator } from "@/components/ai-background-generator";
import { AiImageGenerator } from "@/components/ai-image-generator";
import { AiPatternGenerator } from "@/components/ai-pattern-generator";
import { AiPrintExtractor } from "@/components/ai-print-extractor";
import { PageShell } from "@/components/page-shell";
import { AiImageTabs } from "@/components/ai-image-tabs";

export default function AiImagePage() {
  return (
    <PageShell
      titleZh="AI 图片工作台"
      titleEn="AI Image Studio"
      descriptionZh="AI 生图、AI 提取印花、印花图换底、生成印花。支持多模型，模型配置请前往「设置」。"
      descriptionEn="AI image generation, AI print extraction, transparent print background, and pattern generation. Configure models in Settings."
    >
      <AiImageTabs
        generateTab={<AiImageGenerator />}
        backgroundTab={<AiBackgroundGenerator />}
        extractTab={<AiPrintExtractor />}
        patternTab={<AiPatternGenerator />}
      />
    </PageShell>
  );
}
