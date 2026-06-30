import { AssetsGallery } from "@/components/assets-gallery";
import type { Asset } from "@/components/assets-gallery";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;

const assetColumns = [
  "id",
  "original_url",
  "processed_url",
  "print_extract_url",
  "cutout_url",
  "preferred_design_url",
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

async function getInitialAssets(): Promise<{ assets: Asset[]; error: string | null; total: number }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { count, data, error } = await supabase
      .from("assets")
      .select(assetColumns, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (error) {
      return { assets: [], error: error.message, total: 0 };
    }

    return { assets: (data ?? []) as unknown as Asset[], error: null, total: count ?? 0 };
  } catch (error) {
    return {
      assets: [],
      error: error instanceof Error ? error.message : "读取素材失败",
      total: 0,
    };
  }
}

export default async function AssetsPage() {
  const { assets, error, total } = await getInitialAssets();

  return (
    <PageShell
      titleZh="素材库管理"
      titleEn="Assets"
      descriptionZh="用于管理上传后的图片素材、分类和基础状态。"
      descriptionEn="Manage uploaded image assets, categories, and basic status."
    >
      <AssetsGallery initialAssets={assets} initialError={error} initialTotal={total} />
    </PageShell>
  );
}
