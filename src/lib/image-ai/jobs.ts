import "server-only";

import { randomUUID } from "crypto";

import { cutoutImage } from "@/lib/image-ai/cutout";
import { extractPrintFromImage } from "@/lib/image-ai/print-extraction";
import type {
  CutoutImageOptions,
  CutoutMode,
  PrintExtractionMode,
  PrintExtractionOptions,
  ProcessingBBox,
} from "@/lib/image-ai/types";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ProcessingKind = "cutout" | "print_extraction";
type JobStatus = "pending" | "processing" | "completed" | "failed" | "partial_failed";
type ItemStatus = "pending" | "processing" | "completed" | "failed";

type AssetForProcessing = {
  cutout_url: string | null;
  filename: string;
  id: string;
  original_url: string;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
};

type ImageJobItemForProcessing = {
  asset_id: string;
  error_message: string | null;
  id: string;
  input_url: string;
  output_url: string | null;
  status: ItemStatus;
};

type ProcessingJobOptions = {
  cutout_options?: CutoutImageOptions;
  cutout_mode?: CutoutMode;
  manual_rect?: ProcessingBBox;
  print_extraction_mode?: PrintExtractionMode;
  print_extraction_options?: PrintExtractionOptions;
  processing_kind: ProcessingKind;
};

export type ImageAiProcessingResultItem = {
  asset_id: string;
  derivative_id: string | null;
  error_message: string | null;
  filename: string;
  input_url: string;
  item_id: string;
  mask_url: string | null;
  output_url: string | null;
  preview_url: string | null;
  status: "completed" | "failed";
};

export type ImageAiProcessingJobResult = {
  failed_count: number;
  id: string;
  items: ImageAiProcessingResultItem[];
  status: JobStatus;
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

function buildDerivativePath(filename: string, suffix: string, extension: "jpg" | "png") {
  const datePath = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFilename(filename).replace(/\.[^.]+$/, "");

  return `derivatives/${datePath}/${randomUUID()}-${safeName}-${suffix}.${extension}`;
}

function pickInputUrl(asset: AssetForProcessing) {
  return asset.preferred_design_url ?? asset.processed_url ?? asset.original_url;
}

async function uploadFile(
  _supabase: SupabaseServiceClient,
  path: string,
  content: Buffer,
  _contentType: string,
) {
  return (await saveLocalAssetAtPath({
    buffer: content,
    relativePath: path,
  })).publicUrl;
}

async function updateJobCounts(
  supabase: SupabaseServiceClient,
  jobId: string,
  totalCount: number,
  successCount: number,
  failedCount: number,
  status: JobStatus,
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

async function createJob(
  supabase: SupabaseServiceClient,
  assets: AssetForProcessing[],
  options: ProcessingJobOptions,
) {
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .insert({
      failed_count: 0,
      job_type: "cutout",
      options,
      status: "pending",
      success_count: 0,
      total_count: assets.length,
    })
    .select("id")
    .single();

  if (jobError) {
    throw new Error(`任务创建失败：${jobError.message}`);
  }

  const jobId = (jobData as unknown as { id: string }).id;
  const { error: itemError } = await supabase.from("image_job_items").insert(
    assets.map((asset) => ({
      asset_id: asset.id,
      input_url: pickInputUrl(asset),
      job_id: jobId,
      status: "pending",
    })),
  );

  if (itemError) {
    await supabase
      .from("image_jobs")
      .update({
        error_message: itemError.message,
        failed_count: assets.length,
        status: "failed",
      })
      .eq("id", jobId);
    throw new Error(`子任务创建失败：${itemError.message}`);
  }

  return jobId;
}

async function getJobItems(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("image_job_items")
    .select("id,asset_id,input_url,output_url,status,error_message")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`读取子任务失败：${error.message}`);
  }

  return (data ?? []) as unknown as ImageJobItemForProcessing[];
}

async function insertCutoutDerivative(
  supabase: SupabaseServiceClient,
  asset: AssetForProcessing,
  item: ImageJobItemForProcessing,
  jobId: string,
  options: ProcessingJobOptions,
) {
  const result = await cutoutImage({
    imageUrl: item.input_url,
    mode: options.cutout_mode ?? "auto_background",
    options: options.cutout_options,
  });

  const outputUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "cutout", "png"),
    result.cutoutPng,
    "image/png",
  );
  const previewUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "preview", "jpg"),
    result.previewJpg,
    "image/jpeg",
  );
  const maskUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "mask", "png"),
    result.maskPng,
    "image/png",
  );

  const { data: derivativeData, error: derivativeError } = await supabase
    .from("image_derivatives")
    .insert({
      asset_id: asset.id,
      bbox: result.bbox,
      derivative_type: "cutout",
      height: result.height,
      job_id: jobId,
      job_item_id: item.id,
      mask_url: maskUrl,
      metrics: result.metrics,
      options,
      output_url: outputUrl,
      preview_url: previewUrl,
      source_url: item.input_url,
      status: "completed",
      width: result.width,
    })
    .select("id")
    .single();

  if (derivativeError) {
    throw new Error(`抠图结果保存失败：${derivativeError.message}`);
  }

  const { error: assetUpdateError } = await supabase
    .from("assets")
    .update({
      cutout_url: outputUrl,
      preferred_design_url: asset.preferred_design_url ?? outputUrl,
      status: "processed",
    })
    .eq("id", asset.id);

  if (assetUpdateError) {
    throw new Error(`素材更新失败：${assetUpdateError.message}`);
  }

  return {
    derivativeId: (derivativeData as unknown as { id: string }).id,
    maskUrl,
    outputUrl,
    previewUrl,
  };
}

async function insertPrintExtractionDerivatives(
  supabase: SupabaseServiceClient,
  asset: AssetForProcessing,
  item: ImageJobItemForProcessing,
  jobId: string,
  options: ProcessingJobOptions,
) {
  const result = await extractPrintFromImage({
    imageUrl: item.input_url,
    manualRect: options.manual_rect,
    mode: options.print_extraction_mode ?? "auto",
    options: options.print_extraction_options,
  });

  const rawUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "raw", "png"),
    result.rawPng,
    "image/png",
  );
  const finalUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "final", "png"),
    result.finalPng,
    "image/png",
  );
  const previewUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "preview", "jpg"),
    result.previewJpg,
    "image/jpeg",
  );
  const maskUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "mask", "png"),
    result.maskPng,
    "image/png",
  );

  const { error: rawDerivativeError } = await supabase.from("image_derivatives").insert({
    asset_id: asset.id,
    bbox: result.bbox,
    derivative_type: "print_extract_raw",
    height: result.height,
    job_id: jobId,
    job_item_id: item.id,
    mask_url: maskUrl,
    metrics: result.metrics,
    options,
    output_url: rawUrl,
    preview_url: previewUrl,
    source_url: item.input_url,
    status: "completed",
    width: result.width,
  });

  if (rawDerivativeError) {
    throw new Error(`粗提取结果保存失败：${rawDerivativeError.message}`);
  }

  const { data: finalDerivativeData, error: finalDerivativeError } = await supabase
    .from("image_derivatives")
    .insert({
      asset_id: asset.id,
      bbox: result.bbox,
      derivative_type: "print_extract_final",
      height: result.height,
      job_id: jobId,
      job_item_id: item.id,
      mask_url: maskUrl,
      metrics: result.metrics,
      options,
      output_url: finalUrl,
      preview_url: previewUrl,
      source_url: item.input_url,
      status: "completed",
      width: result.width,
    })
    .select("id")
    .single();

  if (finalDerivativeError) {
    throw new Error(`最终提取结果保存失败：${finalDerivativeError.message}`);
  }

  const { error: assetUpdateError } = await supabase
    .from("assets")
    .update({
      preferred_design_url: finalUrl,
      print_extract_url: finalUrl,
      status: "processed",
    })
    .eq("id", asset.id);

  if (assetUpdateError) {
    throw new Error(`素材更新失败：${assetUpdateError.message}`);
  }

  return {
    derivativeId: (finalDerivativeData as unknown as { id: string }).id,
    maskUrl,
    outputUrl: finalUrl,
    previewUrl,
  };
}

async function processItem(
  supabase: SupabaseServiceClient,
  jobId: string,
  asset: AssetForProcessing,
  item: ImageJobItemForProcessing,
  options: ProcessingJobOptions,
) {
  await supabase
    .from("image_job_items")
    .update({ error_message: null, status: "processing" })
    .eq("id", item.id);

  await supabase.from("assets").update({ status: "processing" }).eq("id", asset.id);

  const result =
    options.processing_kind === "cutout"
      ? await insertCutoutDerivative(supabase, asset, item, jobId, options)
      : await insertPrintExtractionDerivatives(supabase, asset, item, jobId, options);

  await supabase
    .from("image_job_items")
    .update({
      error_message: null,
      output_url: result.outputUrl,
      status: "completed",
    })
    .eq("id", item.id);

  return result;
}

export async function createAndProcessImageAiJob(
  supabase: SupabaseServiceClient,
  assetIds: string[],
  options: ProcessingJobOptions,
): Promise<ImageAiProcessingJobResult> {
  const { data: assetData, error: assetError } = await supabase
    .from("assets")
    .select("id,filename,original_url,processed_url,print_extract_url,cutout_url,preferred_design_url")
    .in("id", assetIds);

  if (assetError) {
    throw new Error(assetError.message);
  }

  const assets = (assetData ?? []) as unknown as AssetForProcessing[];

  if (assets.length !== assetIds.length) {
    throw new Error("部分素材不存在，请刷新后重试");
  }

  const jobId = await createJob(supabase, assets, options);
  const items = await getJobItems(supabase, jobId);
  const itemByAssetId = new Map(items.map((item) => [item.asset_id, item]));
  const resultItems: ImageAiProcessingResultItem[] = [];
  let successCount = 0;
  let failedCount = 0;

  await updateJobCounts(supabase, jobId, assets.length, 0, 0, "processing");

  for (const asset of assets) {
    const item = itemByAssetId.get(asset.id);

    if (!item) {
      failedCount += 1;
      resultItems.push({
        asset_id: asset.id,
        derivative_id: null,
        error_message: "子任务记录不存在",
        filename: asset.filename,
        input_url: pickInputUrl(asset),
        item_id: "",
        mask_url: null,
        output_url: null,
        preview_url: null,
        status: "failed",
      });
      await updateJobCounts(supabase, jobId, assets.length, successCount, failedCount, "processing");
      continue;
    }

    try {
      const result = await processItem(supabase, jobId, asset, item, options);

      successCount += 1;
      resultItems.push({
        asset_id: asset.id,
        derivative_id: result.derivativeId,
        error_message: null,
        filename: asset.filename,
        input_url: item.input_url,
        item_id: item.id,
        mask_url: result.maskUrl,
        output_url: result.outputUrl,
        preview_url: result.previewUrl,
        status: "completed",
      });
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

      await supabase.from("image_derivatives").insert({
        asset_id: asset.id,
        derivative_type:
          options.processing_kind === "cutout" ? "cutout" : "print_extract_final",
        error_message: errorMessage,
        job_id: jobId,
        job_item_id: item.id,
        options,
        source_url: item.input_url,
        status: "failed",
      });

      await supabase.from("assets").update({ status: "failed" }).eq("id", asset.id);

      resultItems.push({
        asset_id: asset.id,
        derivative_id: null,
        error_message: errorMessage,
        filename: asset.filename,
        input_url: item.input_url,
        item_id: item.id,
        mask_url: null,
        output_url: null,
        preview_url: null,
        status: "failed",
      });
    }

    await updateJobCounts(supabase, jobId, assets.length, successCount, failedCount, "processing");
  }

  const status: JobStatus =
    failedCount === 0 ? "completed" : successCount === 0 ? "failed" : "partial_failed";

  await updateJobCounts(supabase, jobId, assets.length, successCount, failedCount, status);

  return {
    failed_count: failedCount,
    id: jobId,
    items: resultItems,
    status,
    success_count: successCount,
    total_count: assets.length,
  };
}
