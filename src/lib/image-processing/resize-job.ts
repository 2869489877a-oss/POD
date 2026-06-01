import "server-only";

import { randomUUID } from "crypto";

import { resizeImageBuffer } from "@/lib/image-processing/resize-image";
import {
  getResizePreset,
  type ResizePreset,
  type ResizePresetKey,
} from "@/lib/image-processing/resize-presets";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ASSETS_BUCKET = "assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ImageJobRow = {
  error_message: string | null;
  failed_count: number;
  id: string;
  job_type: string;
  options: unknown;
  status: "pending" | "processing" | "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
};

type ImageJobItemRow = {
  asset_id: string;
  error_message: string | null;
  id: string;
  input_url: string;
  output_url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
};

type AssetRow = {
  filename: string;
  id: string;
};

export type ResizeJobProgress = {
  failed_count: number;
  id: string;
  items: ImageJobItemRow[];
  status: ImageJobRow["status"];
  success_count: number;
  total_count: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-") || "image";
}

function getPresetKeyFromOptions(options: unknown): ResizePresetKey | null {
  if (!options || typeof options !== "object" || !("preset_key" in options)) {
    return null;
  }

  const presetKey = (options as { preset_key?: unknown }).preset_key;
  return presetKey === "tshirt-print" || presetKey === "square-product" ? presetKey : null;
}

async function downloadImage(inputUrl: string) {
  const response = await fetch(inputUrl);

  if (!response.ok) {
    throw new Error(`原图下载失败：HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function buildOutputPath(jobId: string, asset: AssetRow, preset: ResizePreset) {
  const datePath = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(asset.filename).replace(/\.[^.]+$/, "");
  return `processed/resize/${datePath}/${jobId}/${asset.id}-${randomUUID()}-${filename}.${preset.extension}`;
}

async function updateJobCounts(
  supabase: SupabaseServiceClient,
  jobId: string,
  totalCount: number,
  successCount: number,
  failedCount: number,
  status: ImageJobRow["status"],
) {
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

export async function getResizeJobProgress(
  supabase: SupabaseServiceClient,
  jobId: string,
): Promise<ResizeJobProgress> {
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,status,total_count,success_count,failed_count,error_message,options")
    .eq("id", jobId)
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  const job = jobData as unknown as ImageJobRow;
  const { data: itemData, error: itemError } = await supabase
    .from("image_job_items")
    .select("id,asset_id,input_url,output_url,status,error_message")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  return {
    failed_count: job.failed_count,
    id: job.id,
    items: (itemData ?? []) as unknown as ImageJobItemRow[],
    status: job.status,
    success_count: job.success_count,
    total_count: job.total_count,
  };
}

export async function processResizeJob(
  supabase: SupabaseServiceClient,
  jobId: string,
): Promise<ResizeJobProgress> {
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,status,total_count,success_count,failed_count,error_message,options")
    .eq("id", jobId)
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  const job = jobData as unknown as ImageJobRow;

  if (job.job_type !== "resize") {
    throw new Error("任务类型不是批量改尺寸");
  }

  if (job.status === "completed" || job.status === "partial_failed" || job.status === "failed") {
    return getResizeJobProgress(supabase, jobId);
  }

  const presetKey = getPresetKeyFromOptions(job.options);
  const preset = getResizePreset(presetKey);

  if (!preset) {
    throw new Error("缺少有效的尺寸预设");
  }

  const { data: itemData, error: itemError } = await supabase
    .from("image_job_items")
    .select("id,asset_id,input_url,output_url,status,error_message")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  const items = (itemData ?? []) as unknown as ImageJobItemRow[];

  if (items.length === 0) {
    await supabase
      .from("image_jobs")
      .update({
        error_message: "任务没有可处理的图片",
        failed_count: 0,
        status: "failed",
        success_count: 0,
        total_count: 0,
      })
      .eq("id", jobId);

    return getResizeJobProgress(supabase, jobId);
  }

  const assetIds = items.map((item) => item.asset_id);
  const { data: assetData, error: assetError } = await supabase
    .from("assets")
    .select("id,filename")
    .in("id", assetIds);

  if (assetError) {
    throw new Error(assetError.message);
  }

  const assets = new Map(
    ((assetData ?? []) as unknown as AssetRow[]).map((asset) => [asset.id, asset]),
  );
  let successCount = 0;
  let failedCount = 0;

  await supabase.from("assets").update({ status: "processing" }).in("id", assetIds);
  await updateJobCounts(supabase, jobId, items.length, 0, 0, "processing");

  for (const item of items) {
    const asset = assets.get(item.asset_id);

    if (!asset) {
      failedCount += 1;
      await supabase
        .from("image_job_items")
        .update({
          error_message: "素材记录不存在",
          status: "failed",
        })
        .eq("id", item.id);
      await updateJobCounts(supabase, jobId, items.length, successCount, failedCount, "processing");
      continue;
    }

    try {
      await supabase
        .from("image_job_items")
        .update({ error_message: null, status: "processing" })
        .eq("id", item.id);

      const inputBuffer = await downloadImage(item.input_url);
      const outputBuffer = await resizeImageBuffer(inputBuffer, preset);
      const outputPath = buildOutputPath(jobId, asset, preset);

      const { error: uploadError } = await supabase.storage
        .from(ASSETS_BUCKET)
        .upload(outputPath, outputBuffer, {
          contentType: preset.mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`处理结果上传失败：${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(ASSETS_BUCKET)
        .getPublicUrl(outputPath);
      const outputUrl = publicUrlData.publicUrl;

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

      await supabase
        .from("image_job_items")
        .update({
          error_message: null,
          output_url: outputUrl,
          status: "completed",
        })
        .eq("id", item.id);

      successCount += 1;
    } catch (error) {
      failedCount += 1;
      const errorMessage = getErrorMessage(error);

      await supabase
        .from("image_job_items")
        .update({
          error_message: errorMessage,
          status: "failed",
        })
        .eq("id", item.id);
      await supabase
        .from("assets")
        .update({ status: "failed" })
        .eq("id", item.asset_id);
    }

    await updateJobCounts(supabase, jobId, items.length, successCount, failedCount, "processing");
  }

  const finalStatus =
    failedCount === 0 ? "completed" : successCount === 0 ? "failed" : "partial_failed";

  await updateJobCounts(supabase, jobId, items.length, successCount, failedCount, finalStatus);

  return getResizeJobProgress(supabase, jobId);
}
