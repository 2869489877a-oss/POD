import {
  MockupJobsManager,
  type MockupJobAsset,
  type MockupJobTemplate,
} from "@/components/mockup-jobs-manager";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getInitialData(): Promise<{
  assets: MockupJobAsset[];
  error: string | null;
  templates: MockupJobTemplate[];
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const [assetsResponse, templatesResponse] = await Promise.all([
      supabase
        .from("assets")
        .select("id,filename,original_url,processed_url,status")
        .order("created_at", { ascending: false }),
      supabase
        .from("mockup_templates")
        .select("id,name,product_type,scenes,status")
        .eq("status", "active")
        .order("created_at", { ascending: false }),
    ]);

    if (assetsResponse.error) {
      return { assets: [], error: assetsResponse.error.message, templates: [] };
    }

    if (templatesResponse.error) {
      return { assets: [], error: templatesResponse.error.message, templates: [] };
    }

    return {
      assets: (assetsResponse.data ?? []) as unknown as MockupJobAsset[],
      error: null,
      templates: (templatesResponse.data ?? []) as unknown as MockupJobTemplate[],
    };
  } catch (error) {
    return {
      assets: [],
      error: error instanceof Error ? error.message : "读取套图任务数据失败",
      templates: [],
    };
  }
}

export default async function MockupJobsPage() {
  const { assets, error, templates } = await getInitialData();

  return (
    <PageShell title="套图任务" description="用于管理固定商品套图的批量生成任务。">
      <MockupJobsManager assets={assets} initialError={error} templates={templates} />
    </PageShell>
  );
}
