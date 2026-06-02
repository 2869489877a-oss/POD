"use client";

import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";
import { SettingsPanel } from "@/components/settings-panel";

export default function SettingsPage() {
  return (
    <PageShell
      titleZh="设置"
      titleEn="Settings"
      descriptionZh="管理外观、语言、主题颜色和 AI 模型配置。"
      descriptionEn="Manage appearance, language, theme color and AI model configuration."
    >
      <div className="space-y-8">
        <SettingsPanel />
        <AiProvidersManager />
      </div>
    </PageShell>
  );
}
