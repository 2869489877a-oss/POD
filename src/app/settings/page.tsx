"use client";

import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";
import { SettingsPanel } from "@/components/settings-panel";
import { useSettings } from "@/lib/settings/context";

export default function SettingsPage() {
  const { t } = useSettings();

  return (
    <PageShell
      title={t("设置", "Settings")}
      description={t("管理外观、语言、主题颜色和 AI 模型配置。", "Manage appearance, language, theme color and AI model config.")}
    >
      <div className="space-y-8">
        <SettingsPanel />
        <AiProvidersManager />
      </div>
    </PageShell>
  );
}
