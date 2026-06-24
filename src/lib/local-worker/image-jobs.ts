import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";
import { archiveOldImageJobItems } from "@/lib/maintenance/supabase-archive";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";

import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type LocalWorkerJobType = "cutout" | "print_extraction";
type ImageJobStatus = "pending" | "processing" | "completed" | "failed" | "partial_failed";

type AssetForWorker = {
  cutout_url: string | null;
  filename: string;
  id: string;
  original_url: string;
  preferred_design_url: string | null;
  print_extract_url: string | null;
  processed_url: string | null;
};

type WorkerJobOptions = {
  execution: "local_worker";
  manual_rects?: Record<string, unknown>;
  mode: string;
  options: Record<string, unknown>;
  processing_kind: LocalWorkerJobType;
  set_preferred: boolean;
};

export type CreateLocalWorkerImageJobInput = {
  assetIds: string[];
  jobType: LocalWorkerJobType;
  manualRects?: Record<string, unknown>;
  mode: string;
  options: Record<string, unknown>;
  setPreferred: boolean;
};

type JoinedWorkerItemRow = {
  asset_id: string;
  assets: AssetForWorker | AssetForWorker[] | null;
  id: string;
  image_jobs:
    | {
        id: string;
        job_type: LocalWorkerJobType;
        options: WorkerJobOptions;
        status: ImageJobStatus;
      }
    | Array<{
        id: string;
        job_type: LocalWorkerJobType;
        options: WorkerJobOptions;
        status: ImageJobStatus;
      }>
    | null;
  input_url: string;
  job_id: string;
};

type WorkerFileInput = {
  buffer: Buffer;
  contentType: string;
};

export type CompleteLocalWorkerItemInput = {
  bbox: Record<string, unknown>;
  height: number | null;
  mask: WorkerFileInput | null;
  metrics: Record<string, unknown>;
  output: WorkerFileInput;
  preview: WorkerFileInput | null;
  raw: WorkerFileInput | null;
  width: number | null;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
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

function pickInputUrl(asset: AssetForWorker) {
  return (
    asset.preferred_design_url ??
    asset.print_extract_url ??
    asset.cutout_url ??
    asset.processed_url ??
    asset.original_url
  );
}

function buildOptions(input: CreateLocalWorkerImageJobInput): WorkerJobOptions {
  return {
    execution: "local_worker",
    manual_rects: input.manualRects,
    mode: input.mode,
    options: input.options,
    processing_kind: input.jobType,
    set_preferred: input.setPreferred,
  };
}

async function uploadFile(
  _supabase: SupabaseServiceClient,
  path: string,
  file: WorkerFileInput,
) {
  return (await saveLocalAssetAtPath({
    buffer: file.buffer,
    relativePath: path,
  })).publicUrl;
}

async function ensurePreview(output: WorkerFileInput, preview: WorkerFileInput | null) {
  if (preview) {
    return preview;
  }

  return {
    buffer: await sharp(output.buffer).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer(),
    contentType: "image/jpeg",
  };
}

async function ensureMask(output: WorkerFileInput, mask: WorkerFileInput | null) {
  if (mask) {
    return mask;
  }

  const metadata = await sharp(output.buffer).metadata();
  if (!metadata.hasAlpha) {
    return null;
  }

  return {
    buffer: await sharp(output.buffer).extractChannel("alpha").png().toBuffer(),
    contentType: "image/png",
  };
}

async function getImageSize(output: WorkerFileInput, width: number | null, height: number | null) {
  if (width && height) {
    return { height, width };
  }

  const metadata = await sharp(output.buffer).metadata();
  return {
    height: height ?? metadata.height ?? null,
    width: width ?? metadata.width ?? null,
  };
}

async function updateJobCounts(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("image_job_items")
    .select("status")
    .eq("job_id", jobId);

  if (error) {
    throw new Error(`刷新任务统计失败：${error.message}`);
  }

  const items = (data ?? []) as Array<{ status: string }>;
  const totalCount = items.length;
  const successCount = items.filter((item) => item.status === "completed").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const doneCount = successCount + failedCount;
  const status: ImageJobStatus =
    doneCount < totalCount
      ? "processing"
      : failedCount === 0
        ? "completed"
        : successCount === 0
          ? "failed"
          : "partial_failed";

  const { error: updateError } = await supabase
    .from("image_jobs")
    .update({
      failed_count: failedCount,
      status,
      success_count: successCount,
      total_count: totalCount,
    })
    .eq("id", jobId);

  if (updateError) {
    throw new Error(`更新任务统计失败：${updateError.message}`);
  }

  return {
    failed_count: failedCount,
    status,
    success_count: successCount,
    total_count: totalCount,
  };
}

async function getWorkerItem(supabase: SupabaseServiceClient, itemId: string) {
  const { data, error } = await supabase
    .from("image_job_items")
    .select(
      [
        "id",
        "job_id",
        "asset_id",
        "input_url",
        "image_jobs!inner(id,job_type,status,options)",
        "assets!inner(id,filename,original_url,processed_url,print_extract_url,cutout_url,preferred_design_url)",
      ].join(","),
    )
    .eq("id", itemId)
    .single();

  if (error) {
    throw new Error(`读取 worker 子任务失败：${error.message}`);
  }

  const row = data as unknown as JoinedWorkerItemRow;
  const job = asSingle(row.image_jobs);
  const asset = asSingle(row.assets);

  if (!job || !asset) {
    throw new Error("worker 子任务缺少任务或素材记录");
  }

  return { asset, item: row, job };
}

export async function createLocalWorkerImageJob(
  supabase: SupabaseServiceClient,
  input: CreateLocalWorkerImageJobInput,
) {
  const { data: assetData, error: assetError } = await supabase
    .from("assets")
    .select("id,filename,original_url,processed_url,print_extract_url,cutout_url,preferred_design_url")
    .in("id", input.assetIds);

  if (assetError) {
    throw new Error(`读取素材失败：${assetError.message}`);
  }

  const assets = (assetData ?? []) as unknown as AssetForWorker[];
  if (assets.length !== input.assetIds.length) {
    throw new Error("部分素材不存在，请刷新后重试");
  }

  const missingOriginal = assets.find((asset) => !asset.original_url);
  if (missingOriginal) {
    throw new Error(`素材缺少原图地址：${missingOriginal.filename}`);
  }

  const options = buildOptions(input);
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .insert({
      failed_count: 0,
      job_type: input.jobType,
      options,
      status: "pending",
      success_count: 0,
      total_count: assets.length,
    })
    .select("id,job_type,status,total_count,success_count,failed_count")
    .single();

  if (jobError) {
    throw new Error(`本地 worker 任务创建失败：${jobError.message}`);
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
    throw new Error(`本地 worker 子任务创建失败：${itemError.message}`);
  }

  await supabase.from("assets").update({ status: "processing" }).in(
    "id",
    assets.map((asset) => asset.id),
  );

  return jobData;
}

export async function claimLocalWorkerItem(
  supabase: SupabaseServiceClient,
  jobTypes: LocalWorkerJobType[],
) {
  const { data, error } = await supabase
    .from("image_job_items")
    .select(
      [
        "id",
        "job_id",
        "asset_id",
        "input_url",
        "image_jobs!inner(id,job_type,status,options)",
        "assets!inner(id,filename,original_url,processed_url,print_extract_url,cutout_url,preferred_design_url)",
      ].join(","),
    )
    .eq("status", "pending")
    .in("image_jobs.job_type", jobTypes)
    .in("image_jobs.status", ["pending", "processing"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`领取本地 worker 任务失败：${error.message}`);
  }

  for (const row of (data ?? []) as unknown as JoinedWorkerItemRow[]) {
    const job = asSingle(row.image_jobs);
    const asset = asSingle(row.assets);

    if (!job || !asset) {
      continue;
    }

    const { data: claimedItem } = await supabase
      .from("image_job_items")
      .update({ error_message: null, status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (!claimedItem) {
      continue;
    }

    await Promise.all([
      supabase.from("image_jobs").update({ status: "processing" }).eq("id", row.job_id),
      supabase.from("assets").update({ status: "processing" }).eq("id", row.asset_id),
    ]);

    return {
      asset: {
        filename: asset.filename,
        id: asset.id,
        original_url: asset.original_url,
      },
      input_url: row.input_url,
      item_id: row.id,
      job_id: row.job_id,
      job_type: job.job_type,
      options: job.options,
    };
  }

  return null;
}

export async function completeLocalWorkerItem(
  supabase: SupabaseServiceClient,
  itemId: string,
  input: CompleteLocalWorkerItemInput,
) {
  const { asset, item, job } = await getWorkerItem(supabase, itemId);
  const options = job.options ?? {};
  const { height, width } = await getImageSize(input.output, input.width, input.height);
  const preview = await ensurePreview(input.output, input.preview);
  const mask = await ensureMask(input.output, input.mask);

  const outputUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, job.job_type === "cutout" ? "cutout" : "print-final", "png"),
    input.output,
  );
  const previewUrl = await uploadFile(
    supabase,
    buildDerivativePath(asset.filename, "preview", "jpg"),
    preview,
  );
  const maskUrl = mask
    ? await uploadFile(supabase, buildDerivativePath(asset.filename, "mask", "png"), mask)
    : null;

  if (job.job_type === "print_extraction" && input.raw) {
    const rawUrl = await uploadFile(
      supabase,
      buildDerivativePath(asset.filename, "print-raw", "png"),
      input.raw,
    );

    const { error: rawDerivativeError } = await supabase.from("image_derivatives").insert({
      asset_id: asset.id,
      bbox: input.bbox,
      derivative_type: "print_extract_raw",
      height,
      job_id: item.job_id,
      job_item_id: item.id,
      mask_url: maskUrl,
      metrics: input.metrics,
      options,
      output_url: rawUrl,
      preview_url: previewUrl,
      source_url: item.input_url,
      status: "completed",
      width,
    });

    if (rawDerivativeError) {
      throw new Error(`粗提取结果保存失败：${rawDerivativeError.message}`);
    }
  }

  const derivativeType = job.job_type === "cutout" ? "cutout" : "print_extract_final";
  const { data: derivativeData, error: derivativeError } = await supabase
    .from("image_derivatives")
    .insert({
      asset_id: asset.id,
      bbox: input.bbox,
      derivative_type: derivativeType,
      height,
      job_id: item.job_id,
      job_item_id: item.id,
      mask_url: maskUrl,
      metrics: input.metrics,
      options,
      output_url: outputUrl,
      preview_url: previewUrl,
      source_url: item.input_url,
      status: "completed",
      width,
    })
    .select("id")
    .single();

  if (derivativeError) {
    throw new Error(`处理结果保存失败：${derivativeError.message}`);
  }

  const setPreferred = options.set_preferred === true;
  const assetUpdate =
    job.job_type === "cutout"
      ? {
          cutout_url: outputUrl,
          ...(setPreferred ? { preferred_design_url: outputUrl } : {}),
          status: "processed",
        }
      : {
          preferred_design_url: setPreferred ? outputUrl : asset.preferred_design_url,
          print_extract_url: outputUrl,
          status: "processed",
        };

  const { error: assetUpdateError } = await supabase.from("assets").update(assetUpdate).eq("id", asset.id);
  if (assetUpdateError) {
    throw new Error(`素材更新失败：${assetUpdateError.message}`);
  }

  const { error: itemUpdateError } = await supabase
    .from("image_job_items")
    .update({
      error_message: null,
      output_url: outputUrl,
      status: "completed",
    })
    .eq("id", item.id);

  if (itemUpdateError) {
    throw new Error(`子任务更新失败：${itemUpdateError.message}`);
  }

  const jobCounts = await updateJobCounts(supabase, item.job_id);
  if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
    await archiveOldImageJobItems(supabase);
  }

  return {
    derivative_id: (derivativeData as unknown as { id: string }).id,
    job: jobCounts,
    mask_url: maskUrl,
    output_url: outputUrl,
    preview_url: previewUrl,
  };
}

export async function failLocalWorkerItem(
  supabase: SupabaseServiceClient,
  itemId: string,
  errorMessage: string,
) {
  const { asset, item, job } = await getWorkerItem(supabase, itemId);
  const derivativeType = job.job_type === "cutout" ? "cutout" : "print_extract_final";

  await supabase.from("image_derivatives").insert({
    asset_id: asset.id,
    derivative_type: derivativeType,
    error_message: errorMessage,
    job_id: item.job_id,
    job_item_id: item.id,
    options: job.options ?? {},
    source_url: item.input_url,
    status: "failed",
  });

  const { error: itemUpdateError } = await supabase
    .from("image_job_items")
    .update({
      error_message: errorMessage,
      status: "failed",
    })
    .eq("id", item.id);

  if (itemUpdateError) {
    throw new Error(`子任务失败状态更新失败：${itemUpdateError.message}`);
  }

  await supabase.from("assets").update({ status: "failed" }).eq("id", asset.id);

  const jobCounts = await updateJobCounts(supabase, item.job_id);
  if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
    await archiveOldImageJobItems(supabase);
  }
  return jobCounts;
}
