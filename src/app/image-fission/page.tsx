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

export default async function ImageFissionPage() {
  const { assets, error, total } = await getInitialAssets();

  return (
    <PageShell
      titleZh="图片裂变"
      titleEn="Image Fission"
      descriptionZh="从素材库选择图片，分为 AI 语义裂变和本地快速裂变；快速裂变支持镜像、旋转、缩放、换底、平铺和一图多变体。"
      descriptionEn="Select assets for AI semantic fission or local quick fission, including flip, rotate, scale, background fill, tile, and one-to-many variants."
    >
      <AssetsGallery initialAssets={assets} initialError={error} initialTotal={total} processedFirst showFissionComparison />
    </PageShell>
  );
}
