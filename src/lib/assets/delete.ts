import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ASSETS_BUCKET = "assets";

export type DeleteAssetResult = {
  asset_id: string;
  error?: string;
  filename?: string;
  success: boolean;
};

export type AssetUsageSummary = {
  asset_id: string;
  image_job_item_count: number;
  mockup_output_count: number;
  product_draft_count: number;
  used: boolean;
};

type AssetForDelete = {
  filename: string;
  id: string;
  original_url: string;
  processed_url: string | null;
};

type ImageJobItemReference = {
  asset_id: string;
  job_id: string;
};

type MockupOutputReference = {
  asset_id: string;
  id: string;
};

type ProductDraftReference = {
  asset_id: string;
  id: string;
  mockup_output_id: string | null;
};

function uniqueAssetIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

function storagePathFromPublicUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const pathname = new URL(url).pathname;
    const marker = `/object/public/${ASSETS_BUCKET}/`;
    const markerIndex = pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

function deleteErrorMessage(message: string) {
  if (message.toLowerCase().includes("foreign key")) {
    return "素材已被任务、套图或商品草稿引用，暂不能删除";
  }

  return message;
}

export function parseDeleteAssetIds(value: unknown) {
  const assetIds = uniqueAssetIds(value);

  if (assetIds.length === 0) {
    throw new Error("请选择要删除的素材");
  }

  return assetIds;
}

function countByAssetId<T>(items: T[], getAssetId: (item: T) => string) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const assetId = getAssetId(item);
    counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
  }

  return counts;
}

async function updateAffectedJobCounts(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  jobIds: string[],
) {
  for (const jobId of Array.from(new Set(jobIds))) {
    const { data, error } = await supabase
      .from("image_job_items")
      .select("status")
      .eq("job_id", jobId);

    if (error) {
      continue;
    }

    const statuses = ((data ?? []) as unknown as Array<{ status: string }>).map((item) => item.status);
    const totalCount = statuses.length;
    const successCount = statuses.filter((status) => status === "completed").length;
    const failedCount = statuses.filter((status) => status === "failed").length;
    const activeCount = statuses.filter((status) => status === "pending" || status === "processing").length;
    const status =
      activeCount > 0
        ? "processing"
        : failedCount === 0
          ? "completed"
          : successCount === 0
            ? "failed"
            : "partial_failed";

    await supabase
      .from("image_jobs")
      .update({
        failed_count: failedCount,
        status,
        success_count: successCount,
        total_count: totalCount,
      })
      .eq("id", jobId);
  }
}

export async function getAssetUsageSummary(assetIds: string[]) {
  const supabase = createSupabaseServiceRoleClient();
  const [jobItemsResponse, mockupOutputsResponse] = await Promise.all([
    supabase.from("image_job_items").select("asset_id,job_id").in("asset_id", assetIds),
    supabase.from("mockup_outputs").select("id,asset_id").in("asset_id", assetIds),
  ]);

  if (jobItemsResponse.error) {
    throw new Error(jobItemsResponse.error.message);
  }

  if (mockupOutputsResponse.error) {
    throw new Error(mockupOutputsResponse.error.message);
  }

  const imageJobItems = (jobItemsResponse.data ?? []) as unknown as ImageJobItemReference[];
  const mockupOutputs = (mockupOutputsResponse.data ?? []) as unknown as MockupOutputReference[];
  const mockupOutputIds = mockupOutputs.map((output) => output.id);
  const productDrafts: ProductDraftReference[] = [];
  const directDraftResponse = await supabase
    .from("product_drafts")
    .select("id,asset_id,mockup_output_id")
    .in("asset_id", assetIds);

  if (directDraftResponse.error) {
    throw new Error(directDraftResponse.error.message);
  }

  productDrafts.push(...((directDraftResponse.data ?? []) as unknown as ProductDraftReference[]));

  if (mockupOutputIds.length > 0) {
    const outputDraftResponse = await supabase
      .from("product_drafts")
      .select("id,asset_id,mockup_output_id")
      .in("mockup_output_id", mockupOutputIds);

    if (outputDraftResponse.error) {
      throw new Error(outputDraftResponse.error.message);
    }

    const knownDraftIds = new Set(productDrafts.map((draft) => draft.id));
    productDrafts.push(
      ...((outputDraftResponse.data ?? []) as unknown as ProductDraftReference[]).filter(
        (draft) => !knownDraftIds.has(draft.id),
      ),
    );
  }
  const imageJobItemCounts = countByAssetId(imageJobItems, (item) => item.asset_id);
  const mockupOutputCounts = countByAssetId(mockupOutputs, (output) => output.asset_id);
  const productDraftCounts = new Map<string, number>();
  const outputAssetById = new Map(mockupOutputs.map((output) => [output.id, output.asset_id]));

  for (const draft of productDrafts) {
    const relatedAssetId =
      draft.asset_id && assetIds.includes(draft.asset_id)
        ? draft.asset_id
        : draft.mockup_output_id
          ? outputAssetById.get(draft.mockup_output_id)
          : null;

    if (relatedAssetId) {
      productDraftCounts.set(relatedAssetId, (productDraftCounts.get(relatedAssetId) ?? 0) + 1);
    }
  }

  return assetIds.map((assetId) => {
    const imageJobItemCount = imageJobItemCounts.get(assetId) ?? 0;
    const mockupOutputCount = mockupOutputCounts.get(assetId) ?? 0;
    const productDraftCount = productDraftCounts.get(assetId) ?? 0;

    return {
      asset_id: assetId,
      image_job_item_count: imageJobItemCount,
      mockup_output_count: mockupOutputCount,
      product_draft_count: productDraftCount,
      used: imageJobItemCount + mockupOutputCount + productDraftCount > 0,
    };
  });
}

async function deleteAssetReferences(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  assetIds: string[],
) {
  const [jobItemsResponse, mockupOutputsResponse] = await Promise.all([
    supabase.from("image_job_items").select("asset_id,job_id").in("asset_id", assetIds),
    supabase.from("mockup_outputs").select("id,asset_id").in("asset_id", assetIds),
  ]);

  if (jobItemsResponse.error) {
    throw new Error(jobItemsResponse.error.message);
  }

  if (mockupOutputsResponse.error) {
    throw new Error(mockupOutputsResponse.error.message);
  }

  const imageJobItems = (jobItemsResponse.data ?? []) as unknown as ImageJobItemReference[];
  const mockupOutputs = (mockupOutputsResponse.data ?? []) as unknown as MockupOutputReference[];
  const mockupOutputIds = mockupOutputs.map((output) => output.id);

  if (mockupOutputIds.length > 0) {
    const { error } = await supabase
      .from("product_drafts")
      .delete()
      .in("mockup_output_id", mockupOutputIds);

    if (error) {
      throw new Error(`关联商品草稿删除失败：${error.message}`);
    }
  }

  const { error: productDraftError } = await supabase
    .from("product_drafts")
    .delete()
    .in("asset_id", assetIds);

  if (productDraftError) {
    throw new Error(`关联商品草稿删除失败：${productDraftError.message}`);
  }

  const { error: mockupOutputError } = await supabase
    .from("mockup_outputs")
    .delete()
    .in("asset_id", assetIds);

  if (mockupOutputError) {
    throw new Error(`关联套图结果删除失败：${mockupOutputError.message}`);
  }

  const { error: jobItemError } = await supabase
    .from("image_job_items")
    .delete()
    .in("asset_id", assetIds);

  if (jobItemError) {
    throw new Error(`关联任务子项删除失败：${jobItemError.message}`);
  }

  await updateAffectedJobCounts(
    supabase,
    imageJobItems.map((item) => item.job_id),
  );
}

export async function deleteAssets(assetIds: string[], options: { force?: boolean } = {}) {
  const supabase = createSupabaseServiceRoleClient();
  const usage = await getAssetUsageSummary(assetIds);
  const hasUsedAsset = usage.some((item) => item.used);

  if (hasUsedAsset && !options.force) {
    return {
      requiresConfirmation: true,
      results: [] as DeleteAssetResult[],
      usage,
    };
  }

  if (hasUsedAsset) {
    await deleteAssetReferences(supabase, assetIds);
  }

  const { data, error } = await supabase
    .from("assets")
    .select("id,filename,original_url,processed_url")
    .in("id", assetIds);

  if (error) {
    throw new Error(error.message);
  }

  const assets = (data ?? []) as unknown as AssetForDelete[];
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const results: DeleteAssetResult[] = [];

  for (const assetId of assetIds) {
    const asset = assetsById.get(assetId);

    if (!asset) {
      results.push({
        asset_id: assetId,
        error: "素材不存在",
        success: false,
      });
      continue;
    }

    const { error: deleteError } = await supabase.from("assets").delete().eq("id", asset.id);

    if (deleteError) {
      results.push({
        asset_id: asset.id,
        error: deleteErrorMessage(deleteError.message),
        filename: asset.filename,
        success: false,
      });
      continue;
    }

    const storagePaths = Array.from(
      new Set(
        [asset.original_url, asset.processed_url]
          .map((url) => storagePathFromPublicUrl(url))
          .filter((path): path is string => Boolean(path)),
      ),
    );

    if (storagePaths.length > 0) {
      const { error: storageDeleteError } = await supabase.storage
        .from(ASSETS_BUCKET)
        .remove(storagePaths);

      if (storageDeleteError) {
        results.push({
          asset_id: asset.id,
          error: `Storage 删除失败：${storageDeleteError.message}`,
          filename: asset.filename,
          success: false,
        });
        continue;
      }
    }

    results.push({
      asset_id: asset.id,
      filename: asset.filename,
      success: true,
    });
  }

  return {
    requiresConfirmation: false,
    results,
    usage,
  };
}
