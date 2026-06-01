import { EmptyPage } from "@/components/empty-page";
import { PageShell } from "@/components/page-shell";

export default function SettingsPage() {
  return (
    <PageShell title="设置" description="用于维护系统基础配置。">
      <EmptyPage title="设置页面空壳" description="后续在这里添加基础配置项。" />
    </PageShell>
  );
}
