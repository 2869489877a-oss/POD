import { AssetsGallery } from "@/components/assets-gallery";
import type { Asset } from "@/components/assets-gallery";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

export default async function ImageFissionPage() {
  const { assets, error } = await getInitialAssets();

  return (
    <PageShell
      titleZh="图片裂变"
      titleEn="Image Fission"
      descriptionZh="从素材库选择图片，批量生成镜像、万花镜、残影、错位切片和满版平铺变体。"
      descriptionEn="Select assets and batch-generate mirror, kaleidoscope, echo, slice-shift and tile variants."
    >
      <AssetsGallery initialAssets={assets} initialError={error} />
    </PageShell>
  );
}
