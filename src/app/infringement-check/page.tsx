import { InfringementChecksManager } from "@/components/infringement-checks-manager";
import { fetchInfringementDashboard } from "@/lib/actions/infringement-checks";
import { PageShell } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default async function InfringementCheckPage() {
  const { error, items } = await fetchInfringementDashboard();

  return (
    <PageShell
      titleZh="侵权检测"
      titleEn="Infringement Check"
      descriptionZh="在素材进入套图和导出前，用规则引擎筛出高危 IP、品牌、名人、球队和 Logo 风险，并保留人工复核记录。"
      descriptionEn="Screen high-risk IP, brand, celebrity, sports and logo risks before mockups and exports, with manual review records."
    >
      <InfringementChecksManager initialItems={items} initialError={error} />
    </PageShell>
  );
}
