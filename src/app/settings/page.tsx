"use client";

import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";
import { SettingsPanel } from "@/components/settings-panel";
import { useAuth } from "@/lib/auth/context";

export default function SettingsPage() {
  const { isAdmin } = useAuth();

  return (
    <PageShell
      titleZh="设置"
      titleEn="Settings"
      descriptionZh={isAdmin ? "管理外观、语言、主题颜色和 AI 模型配置。" : "管理外观、语言和主题颜色。"}
      descriptionEn={
        isAdmin
          ? "Manage appearance, language, theme color and AI model configuration."
          : "Manage appearance, language and theme color."
      }
    >
      <div className="space-y-8">
        <SettingsPanel />
        {isAdmin ? <AiProvidersManager /> : null}
      </div>
    </PageShell>
  );
}
