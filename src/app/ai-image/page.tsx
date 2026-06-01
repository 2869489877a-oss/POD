"use client";

import { AiBackgroundGenerator } from "@/components/ai-background-generator";
import { AiImageGenerator } from "@/components/ai-image-generator";
import { AiPatternGenerator } from "@/components/ai-pattern-generator";
import { AiPrintExtractor } from "@/components/ai-print-extractor";
import { PageShell } from "@/components/page-shell";
import { AiImageTabs } from "@/components/ai-image-tabs";
import { useSettings } from "@/lib/settings/context";

export default function AiImagePage() {
  const { t } = useSettings();

  return (
    <PageShell
      title={t("AI 图片工作台", "AI Image Studio")}
      description={t(
        "AI 生图、抠图换背景、抠印花、生成印花。支持多模型，模型配置请前往「设置」。",
        "AI image generation, background swap, print extraction. Multi-model support. Configure models in Settings."
      )}
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
