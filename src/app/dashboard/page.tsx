import { PageShell } from "@/components/page-shell";
import { DashboardOverview } from "@/components/dashboard-overview";
import { fetchDashboardStats } from "@/lib/actions/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await fetchDashboardStats();

  return (
    <PageShell
      titleZh="仪表盘"
      titleEn="Dashboard"
      descriptionZh="POD 商品图批量处理系统概览。"
      descriptionEn="Overview of the POD product image batch system."
    >
      <DashboardOverview stats={stats} />
    </PageShell>
  );
}
