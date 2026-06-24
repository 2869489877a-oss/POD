import "server-only";

import { deleteAssets } from "@/lib/assets/delete";
import { recoverStaleProcessingRows } from "@/lib/local-worker/stale-queue";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type AssetDeleteJobView = {
  created_at: string;
  error_message: string | null;
  failed_count: number;
  force: boolean;
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
  updated_at: string;
};

type AssetDeleteJobRow = AssetDeleteJobView;

type AssetDeleteJobItemRow = {
  asset_id: string;
  error_message: string | null;
  filename: string | null;
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
};

function terminalStatus(successCount: number, failedCount: number, totalCount: number) {
  if (failedCount === 0) return "completed";
  if (successCount === 0) return "failed";
  return successCount + failedCount >= totalCount ? "partial_failed" : "processing";
}

export async function createAssetDeleteJob(
  supabase: SupabaseServiceClient,
  assetIds: string[],
  options: { force?: boolean } = {},
) {
  const { data: assetRows, error: assetError } = await supabase
    .from("assets")
    .select("id,filename")
    .in("id", assetIds);

  if (assetError) {
    throw new Error(assetError.message);
  }

  const filenameById = new Map(
    ((assetRows ?? []) as Array<{ filename?: string | null; id: string }>).map((asset) => [
      asset.id,
      asset.filename ?? null,
    ]),
  );

  const { data: job, error: jobError } = await supabase
    .from("asset_delete_jobs")
    .insert({
      failed_count: 0,
      force: options.force === true,
      status: "pending",
      success_count: 0,
      total_count: assetIds.length,
    })
    .select("id,status,total_count,success_count,failed_count,force,error_message,created_at,updated_at")
    .single();

  if (jobError) {
    throw new Error(`创建删除任务失败: ${jobError.message}`);
  }

  const jobRow = job as unknown as AssetDeleteJobRow;
  const { error: itemError } = await supabase
    .from("asset_delete_job_items")
    .insert(
      assetIds.map((assetId) => ({
        asset_id: assetId,
        filename: filenameById.get(assetId) ?? null,
        job_id: jobRow.id,
        status: "pending",
      })),
    );

  if (itemError) {
    await supabase
      .from("asset_delete_jobs")
      .update({
        error_message: itemError.message,
        failed_count: assetIds.length,
        status: "failed",
      })
      .eq("id", jobRow.id);
    throw new Error(`创建删除子任务失败: ${itemError.message}`);
  }

  await supabase.from("assets").update({ status: "processing" }).in("id", assetIds);

  return jobRow;
}

export async function claimAssetDeleteJob(supabase: SupabaseServiceClient) {
  await recoverStaleProcessingRows(supabase, {
    defaultMinutes: 45,
    envName: "LOCAL_WORKER_STALE_DELETE_MINUTES",
    table: "asset_delete_jobs",
    update: {
      error_message: null,
      status: "pending",
    },
  });

  const { data, error } = await supabase
    .from("asset_delete_jobs")
    .select("id,total_count")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`领取删除任务失败: ${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ id: string; total_count: number }>) {
    const { data: claimed } = await supabase
      .from("asset_delete_jobs")
      .update({ error_message: null, status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id,total_count")
      .maybeSingle();

    if (claimed) {
      return {
        item_id: row.id,
        job_id: row.id,
        job_type: "asset_delete" as const,
        total_count: row.total_count,
      };
    }
  }

  return null;
}

export async function getAssetDeleteJob(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("asset_delete_jobs")
    .select("id,status,total_count,success_count,failed_count,force,error_message,created_at,updated_at")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as AssetDeleteJobView;
}

export async function executeAssetDeleteJob(supabase: SupabaseServiceClient, jobId: string) {
  const job = await getAssetDeleteJob(supabase, jobId);
  const { data: itemRows, error: itemError } = await supabase
    .from("asset_delete_job_items")
    .select("id,asset_id,filename,status,error_message")
    .eq("job_id", jobId)
    .in("status", ["pending", "processing"]);

  if (itemError) {
    throw new Error(itemError.message);
  }

  const items = (itemRows ?? []) as unknown as AssetDeleteJobItemRow[];
  const assetIds = Array.from(new Set(items.map((item) => item.asset_id)));

  if (assetIds.length === 0) {
    await supabase
      .from("asset_delete_jobs")
      .update({
        error_message: null,
        status: job.failed_count > 0 ? "partial_failed" : "completed",
      })
      .eq("id", jobId);
    return getAssetDeleteJob(supabase, jobId);
  }

  await supabase
    .from("asset_delete_job_items")
    .update({ error_message: null, status: "processing" })
    .eq("job_id", jobId)
    .in("asset_id", assetIds);

  const deleteResult = await deleteAssets(assetIds, { force: job.force });
  const resultByAssetId = new Map(deleteResult.results.map((result) => [result.asset_id, result]));
  let successCount = 0;
  let failedCount = 0;

  for (const item of items) {
    const result = resultByAssetId.get(item.asset_id);
    const success = result?.success === true;
    if (success) successCount += 1;
    else failedCount += 1;

    await supabase
      .from("asset_delete_job_items")
      .update({
        error_message: success ? null : result?.error ?? "删除任务未返回结果",
        status: success ? "completed" : "failed",
      })
      .eq("id", item.id);
  }

  const status = terminalStatus(successCount, failedCount, items.length);
  const errorMessage =
    failedCount > 0
      ? deleteResult.results
          .filter((result) => !result.success)
          .slice(0, 3)
          .map((result) => result.error)
          .filter(Boolean)
          .join("; ") || "部分素材删除失败"
      : null;

  await supabase
    .from("asset_delete_jobs")
    .update({
      error_message: errorMessage,
      failed_count: failedCount,
      status,
      success_count: successCount,
    })
    .eq("id", jobId);

  return getAssetDeleteJob(supabase, jobId);
}

export async function failAssetDeleteJob(
  supabase: SupabaseServiceClient,
  jobId: string,
  errorMessage: string,
) {
  const { data: items } = await supabase
    .from("asset_delete_job_items")
    .select("id,status")
    .eq("job_id", jobId)
    .in("status", ["pending", "processing"]);
  const failedIds = ((items ?? []) as Array<{ id: string }>).map((item) => item.id);

  if (failedIds.length > 0) {
    await supabase
      .from("asset_delete_job_items")
      .update({
        error_message: errorMessage,
        status: "failed",
      })
      .in("id", failedIds);
  }

  const { data, error } = await supabase
    .from("asset_delete_jobs")
    .update({
      error_message: errorMessage,
      failed_count: failedIds.length,
      status: "failed",
    })
    .eq("id", jobId)
    .select("id,status,total_count,success_count,failed_count,force,error_message,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as AssetDeleteJobView;
}
