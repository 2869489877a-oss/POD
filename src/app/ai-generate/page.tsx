import {
  AiGenerateForm,
  type ProductDraftOption,
} from "@/components/ai-generate-form";
import { PageShell } from "@/components/page-shell";
import type { AiProvider } from "@/lib/ai/listing-schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getDefaultProvider(): AiProvider {
  return process.env.AI_DEFAULT_PROVIDER === "doubao" ? "doubao" : "qwen";
}

async function getProductDrafts(): Promise<ProductDraftOption[]> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("product_drafts")
      .select("id,title,sku,product_type,status,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return [];
    }

    return (data ?? []) as unknown as ProductDraftOption[];
  } catch {
    return [];
  }
}

export default async function AiGeneratePage() {
  const productDrafts = await getProductDrafts();

  return (
    <PageShell title="AI 生成" description="用于生成商品标题、描述和标签的页面入口。">
      <AiGenerateForm defaultProvider={getDefaultProvider()} productDrafts={productDrafts} />
    </PageShell>
  );
}
