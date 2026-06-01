import { AssetsGallery } from "@/components/assets-gallery";
import type { Asset } from "@/components/assets-gallery";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const assetColumns = [
  "id",
  "original_url",
  "processed_url",
  "filename",
  "file_size",
  "width",
  "height",
  "format",
  "status",
  "source",
  "copyright_status",
  "created_at",
  "updated_at",
].join(",");

async function getInitialAssets(): Promise<{ assets: Asset[]; error: string | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("assets")
      .select(assetColumns)
      .order("created_at", { ascending: false });

    if (error) {
      return { assets: [], error: error.message };
    }

    return { assets: (data ?? []) as unknown as Asset[], error: null };
  } catch (error) {
    return {
      assets: [],
      error: error instanceof Error ? error.message : "读取素材失败",
    };
  }
}

export default async function AssetsPage() {
  const { assets, error } = await getInitialAssets();

  return (
    <PageShell title="素材库管理" description="用于管理上传后的图片素材、分类和基础状态。">
      <AssetsGallery initialAssets={assets} initialError={error} />
    </PageShell>
  );
}
