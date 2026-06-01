import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import { resizeImageBuffer } from "@/lib/image-processing/resize-image";
import {
  getResizePreset,
  type ResizePreset,
  type ResizePresetKey,
} from "@/lib/image-processing/resize-presets";
import { validateScenes, type MockupScene } from "@/lib/mockups/scenes";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ASSETS_BUCKET = "assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ImageJobForRetry = {
  id: string;
  job_type: "resize" | "mockup" | "cutout" | "enhance";
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
  filename: string;
  id: string;
  original_url: string;
  processed_url: string | null;
};

type MockupTemplateForRetry = {
  id: string;
  scenes: unknown;
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

function getTemplateId(options: unknown) {
  if (!options || typeof options !== "object" || !("template_id" in options)) {
    return null;
  }

  const templateId = (options as { template_id?: unknown }).template_id;
  return typeof templateId === "string" && templateId.length > 0 ? templateId : null;
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
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function buildResizeOutputPath(jobId: string, itemId: string, asset: AssetForRetry, preset: ResizePreset) {
  const datePath = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(asset.filename).replace(/\.[^.]+$/, "");
  return `processed/resize-retry/${datePath}/${jobId}/${itemId}-${randomUUID()}-${filename}.${preset.extension}`;
}

function buildMockupOutputPath(
  jobId: string,
  itemId: string,
  asset: AssetForRetry,
  scene: MockupScene,
) {
  const datePath = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(asset.filename).replace(/\.[^.]+$/, "");
  const sceneName = sanitizeFilename(scene.name);
  return `mockup-outputs/retry/${datePath}/${jobId}/${itemId}/${randomUUID()}-${filename}-${sceneName}.png`;
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
    .select("id,filename,original_url,processed_url")
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

  const { error: uploadError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(outputPath, outputBuffer, {
      contentType: preset.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`处理结果上传失败：${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(outputPath);
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

  return outputUrl;
}

async function renderMockupScene(scene: MockupScene, backgroundBuffer: Buffer, printBuffer: Buffer) {
  let image = sharp(backgroundBuffer)
    .rotate()
    .resize(scene.output_width, scene.output_height, {
      fit: "cover",
      position: "center",
    });

  if (scene.need_print && scene.print_area) {
    const printLayer = await sharp(printBuffer)
      .rotate()
      .resize(Math.round(scene.print_area.width), Math.round(scene.print_area.height), {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        fit: "contain",
        position: "center",
      })
      .png()
      .toBuffer();

    image = image.composite([
      {
        input: printLayer,
        left: Math.round(scene.print_area.x),
        top: Math.round(scene.print_area.y),
      },
    ]);
  }

  return image.png().toBuffer();
}

async function retryMockupItem(
  supabase: SupabaseServiceClient,
  jobId: string,
  item: ImageJobItemForRetry,
  asset: AssetForRetry,
  templateId: string,
  scenes: MockupScene[],
) {
  const printBuffer = await downloadImage(asset.processed_url ?? asset.original_url);
  const outputImages: string[] = [];

  for (const scene of scenes) {
    const backgroundBuffer = await downloadImage(scene.background_url);
    const outputBuffer = await renderMockupScene(scene, backgroundBuffer, printBuffer);
    const outputPath = buildMockupOutputPath(jobId, item.id, asset, scene);
    const { error: uploadError } = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(outputPath, outputBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`套图上传失败：${uploadError.message}`);
    }

    const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(outputPath);
    outputImages.push(data.publicUrl);
  }

  const { error: outputError } = await supabase.from("mockup_outputs").insert({
    asset_id: asset.id,
    error_message: null,
    output_images: outputImages,
    status: "completed",
    template_id: templateId,
  });

  if (outputError) {
    throw new Error(`套图结果保存失败：${outputError.message}`);
  }

  return outputImages[0] ?? null;
}

async function getMockupRetryContext(supabase: SupabaseServiceClient, options: unknown) {
  const templateId = getTemplateId(options);

  if (!templateId) {
    throw new Error("原套图任务缺少模板 ID，无法重新执行");
  }

  const { data, error } = await supabase
    .from("mockup_templates")
    .select("id,scenes")
    .eq("id", templateId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const template = data as unknown as MockupTemplateForRetry;

  return {
    scenes: validateScenes(template.scenes),
    templateId: template.id,
  };
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

  if (job.job_type !== "resize" && job.job_type !== "mockup") {
    throw new Error("当前任务类型暂不支持重新执行");
  }

  const items = await getRetryItems(supabase, jobId, requestedItemIds);
  const assetsById = await getAssetsById(
    supabase,
    Array.from(new Set(items.map((item) => item.asset_id))),
  );

  const preset =
    job.job_type === "resize" ? getResizePreset(getResizePresetKey(job.options)) : null;
  const mockupContext =
    job.job_type === "mockup" ? await getMockupRetryContext(supabase, job.options) : null;

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

      const outputUrl =
        job.job_type === "resize"
          ? await retryResizeItem(supabase, jobId, item, asset, preset as ResizePreset)
          : await retryMockupItem(
              supabase,
              jobId,
              item,
              asset,
              mockupContext?.templateId ?? "",
              mockupContext?.scenes ?? [],
            );

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
