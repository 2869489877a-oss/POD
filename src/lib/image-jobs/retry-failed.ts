import "server-only";

import { randomUUID } from "crypto";

import { resizeImageBuffer } from "@/lib/image-processing/resize-image";
import {
  getResizePreset,
  type ResizePreset,
  type ResizePresetKey,
} from "@/lib/image-processing/resize-presets";
import { readImageBuffer } from "@/lib/network/image-buffer";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ImageJobForRetry = {
  id: string;
  job_type: "resize" | "mockup" | "cutout" | "print_extraction" | "enhance";
  options: unknown;
};

type ImageJobItemForRetry = {
  asset_id: string;
  id: string;
  input_url: string;
  output_url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
};

type AssetForRetry = {
  cutout_url: string | null;
  filename: string;
  id: string;
  original_url: string;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
};

type JobCounts = {
  failed_count: number;
  status: "pending" | "processing" | "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
};

export type RetryFailedItemsResult = JobCounts & {
  id: string;
  items: Array<{
    asset_id: string;
    error_message: string | null;
    id: string;
    input_url: string;
    output_url: string | null;
    status: "pending" | "processing" | "completed" | "failed";
  }>;
  retried_count: number;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-") || "image";
}

function getResizePresetKey(options: unknown): ResizePresetKey | null {
  if (!options || typeof options !== "object" || !("preset_key" in options)) {
    return null;
  }

  const presetKey = (options as { preset_key?: unknown }).preset_key;
  return presetKey === "tshirt-print" || presetKey === "square-product" ? presetKey : null;
}

function getRetryItemIds(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

async function downloadImage(url: string) {
  return readImageBuffer(url, {
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
  });
}

function buildResizeOutputPath(jobId: string, itemId: string, asset: AssetForRetry, preset: ResizePreset) {
  const datePath = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(asset.filename).replace(/\.[^.]+$/, "");
  return `processed/resize-retry/${datePath}/${jobId}/${itemId}-${randomUUID()}-${filename}.${preset.extension}`;
}

async function calculateAndUpdateJobCounts(
  supabase: SupabaseServiceClient,
  jobId: string,
): Promise<JobCounts> {
  const { data, error } = await supabase
    .from("image_job_items")
    .select("status")
    .eq("job_id", jobId);

  if (error) {
    throw new Error(error.message);
  }

  const statuses = ((data ?? []) as unknown as Array<{ status: string }>).map((item) => item.status);
  const totalCount = statuses.length;
  const successCount = statuses.filter((status) => status === "completed").length;
  const failedCount = statuses.filter((status) => status === "failed").length;
  const activeCount = statuses.filter((status) => status === "pending" || status === "processing").length;
  const status: JobCounts["status"] =
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

  return {
    failed_count: failedCount,
    status,
    success_count: successCount,
    total_count: totalCount,
  };
}

async function getRetryItems(
  supabase: SupabaseServiceClient,
  jobId: string,
  requestedItemIds: string[] | null,
) {
  let query = supabase
    .from("image_job_items")
    .select("id,asset_id,input_url,output_url,status")
    .eq("job_id", jobId)
    .eq("status", "failed")
    .order("created_at", { ascending: true });

  if (requestedItemIds && requestedItemIds.length > 0) {
    query = query.in("id", requestedItemIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []) as unknown as ImageJobItemForRetry[];

  if (requestedItemIds && items.length !== requestedItemIds.length) {
    throw new Error("部分子任务不是失败状态或不属于当前任务");
  }

  if (items.length === 0) {
    throw new Error("当前任务没有失败项可重新执行");
  }

  return items;
}

async function getAssetsById(supabase: SupabaseServiceClient, assetIds: string[]) {
  const { data, error } = await supabase
    .from("assets")
    .select("id,filename,original_url,processed_url,print_extract_url,cutout_url,preferred_design_url")
    .in("id", assetIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as unknown as AssetForRetry[]).map((asset) => [asset.id, asset]),
  );
}

async function retryResizeItem(
  supabase: SupabaseServiceClient,
  jobId: string,
  item: ImageJobItemForRetry,
  asset: AssetForRetry,
  preset: ResizePreset,
) {
  const inputBuffer = await downloadImage(item.input_url);
  const outputBuffer = await resizeImageBuffer(inputBuffer, preset);
  const outputPath = buildResizeOutputPath(jobId, item.id, asset, preset);

  const outputUrl = (await saveLocalAssetAtPath({
    buffer: outputBuffer,
    relativePath: outputPath,
  })).publicUrl;
  const { error: assetUpdateError } = await supabase
    .from("assets")
    .update({
      processed_url: outputUrl,
      status: "processed",
    })
    .eq("id", asset.id);

  if (assetUpdateError) {
    throw new Error(`素材更新失败：${assetUpdateError.message}`);
  }

  return outputUrl;
}

async function getRetryResult(
  supabase: SupabaseServiceClient,
  jobId: string,
  retriedCount: number,
): Promise<RetryFailedItemsResult> {
  const counts = await calculateAndUpdateJobCounts(supabase, jobId);
  const { data, error } = await supabase
    .from("image_job_items")
    .select("id,asset_id,input_url,output_url,status,error_message")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...counts,
    id: jobId,
    items: (data ?? []) as unknown as RetryFailedItemsResult["items"],
    retried_count: retriedCount,
  };
}

export async function retryFailedImageJobItems(
  supabase: SupabaseServiceClient,
  jobId: string,
  itemIds?: unknown,
) {
  const requestedItemIds = getRetryItemIds(itemIds);
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,options")
    .eq("id", jobId)
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  const job = jobData as unknown as ImageJobForRetry;

  if (
    job.job_type !== "resize" &&
    job.job_type !== "mockup" &&
    job.job_type !== "cutout" &&
    job.job_type !== "print_extraction"
  ) {
    throw new Error("当前任务类型暂不支持重新执行");
  }

  const items = await getRetryItems(supabase, jobId, requestedItemIds);

  if (job.job_type === "cutout" || job.job_type === "print_extraction" || job.job_type === "mockup") {
    const { error: itemUpdateError } = await supabase
      .from("image_job_items")
      .update({
        error_message: null,
        output_url: null,
        status: "pending",
      })
      .in(
        "id",
        items.map((item) => item.id),
      );

    if (itemUpdateError) {
      throw new Error(itemUpdateError.message);
    }

    const { error: assetUpdateError } = await supabase
      .from("assets")
      .update({ status: "processing" })
      .in(
        "id",
        Array.from(new Set(items.map((item) => item.asset_id))),
      );

    if (assetUpdateError) {
      throw new Error(assetUpdateError.message);
    }

    await calculateAndUpdateJobCounts(supabase, jobId);

    return getRetryResult(supabase, jobId, items.length);
  }

  const assetsById = await getAssetsById(
    supabase,
    Array.from(new Set(items.map((item) => item.asset_id))),
  );

  const preset = getResizePreset(getResizePresetKey(job.options));

  if (job.job_type === "resize" && !preset) {
    throw new Error("原任务缺少有效的尺寸预设，无法重新执行");
  }

  await supabase
    .from("image_job_items")
    .update({
      error_message: null,
      output_url: null,
      status: "pending",
    })
    .in(
      "id",
      items.map((item) => item.id),
    );
  await calculateAndUpdateJobCounts(supabase, jobId);

  for (const item of items) {
    const asset = assetsById.get(item.asset_id);

    if (!asset) {
      await supabase
        .from("image_job_items")
        .update({
          error_message: "素材记录不存在",
          status: "failed",
        })
        .eq("id", item.id);
      await calculateAndUpdateJobCounts(supabase, jobId);
      continue;
    }

    try {
      await supabase
        .from("image_job_items")
        .update({ error_message: null, status: "processing" })
        .eq("id", item.id);
      await calculateAndUpdateJobCounts(supabase, jobId);

      const outputUrl = await retryResizeItem(supabase, jobId, item, asset, preset as ResizePreset);

      await supabase
        .from("image_job_items")
        .update({
          error_message: null,
          output_url: outputUrl,
          status: "completed",
        })
        .eq("id", item.id);
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      await supabase
        .from("image_job_items")
        .update({
          error_message: errorMessage,
          status: "failed",
        })
        .eq("id", item.id);

      if (job.job_type === "resize") {
        await supabase.from("assets").update({ status: "failed" }).eq("id", item.asset_id);
      }
    }

    await calculateAndUpdateJobCounts(supabase, jobId);
  }

  return getRetryResult(supabase, jobId, items.length);
}
