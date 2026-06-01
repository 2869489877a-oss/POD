import { AiProvidersManager } from "@/components/ai-providers-manager";
import { PageShell } from "@/components/page-shell";
import { SettingsPanel } from "@/components/settings-panel";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <PageShell title="设置" description="管理外观、语言、主题颜色和 AI 模型配置。">
      <div className="space-y-8">
        <SettingsPanel />
        <AiProvidersManager />
      </div>
    </PageShell>
  );
}
