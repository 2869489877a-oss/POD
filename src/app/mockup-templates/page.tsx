import {
  MockupTemplatesManager,
  type MockupTemplate,
} from "@/components/mockup-templates-manager";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const templateColumns = [
  "id",
  "name",
  "product_type",
  "scenes",
  "status",
  "created_at",
  "updated_at",
].join(",");

async function getInitialTemplates(): Promise<{
  error: string | null;
  templates: MockupTemplate[];
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("mockup_templates")
      .select(templateColumns)
      .order("created_at", { ascending: false });

    if (error) {
      return { error: error.message, templates: [] };
    }

    return { error: null, templates: (data ?? []) as unknown as MockupTemplate[] };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "读取套图模板失败",
      templates: [],
    };
  }
}

export default async function MockupTemplatesPage() {
  const { error, templates } = await getInitialTemplates();

  return (
    <PageShell title="固定商品套图" description="用于维护固定商品套图模板。">
      <MockupTemplatesManager initialError={error} initialTemplates={templates} />
    </PageShell>
  );
}
