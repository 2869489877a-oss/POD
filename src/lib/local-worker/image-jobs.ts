import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";
import { archiveOldImageJobItems } from "@/lib/maintenance/supabase-archive";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";

import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type LocalWorkerJobType = "cutout" | "print_extraction" | "mockup" | "resize" | "fission" | "infringement_check";
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

type StaleWorkerItemRow = {
  id: string;
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
  mockupOutputs?: WorkerFileInput[];
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

function buildMockupOutputPath(jobId: string, itemId: string, filename: string, index: number) {
  const datePath = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFilename(filename).replace(/\.[^.]+$/, "");
  const paddedIndex = String(index + 1).padStart(2, "0");

  return `mockup-outputs/${datePath}/${jobId}/${itemId}/${randomUUID()}-${safeName}-${paddedIndex}.png`;
}

function buildProcessedOutputPath(
  jobType: "resize" | "fission",
  jobId: string,
  itemId: string,
  filename: string,
  extension: "jpg" | "png",
) {
  const datePath = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeFilename(filename).replace(/\.[^.]+$/, "");

  return `processed/${jobType}/${datePath}/${jobId}/${itemId}-${randomUUID()}-${safeName}.${extension}`;
}

function outputExtension(options: unknown, file: WorkerFileInput): "jpg" | "png" {
  const option = stringOption(options, "output_format");
  if (option === "jpg" || option === "jpeg") {
    return "jpg";
  }
  if (option === "png") {
    return "png";
  }

  return file.contentType === "image/jpeg" ? "jpg" : "png";
}

function staleWorkerItemCutoff() {
  const minutes = Number(process.env.LOCAL_WORKER_STALE_ITEM_MINUTES ?? 45);
  const normalizedMinutes = Number.isFinite(minutes) ? Math.max(10, Math.min(24 * 60, minutes)) : 45;
  return new Date(Date.now() - normalizedMinutes * 60 * 1000).toISOString();
}

function stringOption(options: unknown, key: string) {
  if (!options || typeof options !== "object" || !(key in options)) {
    return null;
  }

  const value = (options as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberOption(options: unknown, key: string, fallback: number, min: number, max: number) {
  if (!options || typeof options !== "object" || !(key in options)) {
    return fallback;
  }

  const value = (options as Record<string, unknown>)[key];
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function pickInputUrl(asset: AssetForWorker, jobType: LocalWorkerJobType) {
  if (jobType === "fission") {
    return (
      asset.preferred_design_url ??
      asset.print_extract_url ??
      asset.cutout_url ??
      asset.original_url
    );
  }

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

export async function updateJobCounts(supabase: SupabaseServiceClient, jobId: string) {
  return updateJobCountsFromDatabase(supabase, jobId);
}
async function countJobItems(
  supabase: SupabaseServiceClient,
  jobId: string,
  status?: "pending" | "processing" | "completed" | "failed",
) {
  let query = supabase
    .from("image_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`鍒锋柊浠诲姟缁熻澶辫触锛?{error.message}`);
  }

  return count ?? 0;
}

async function updateJobCountsFromDatabase(supabase: SupabaseServiceClient, jobId: string) {
  const [totalCount, successCount, failedCount] = await Promise.all([
    countJobItems(supabase, jobId),
    countJobItems(supabase, jobId, "completed"),
    countJobItems(supabase, jobId, "failed"),
  ]);
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
    throw new Error(`鏇存柊浠诲姟缁熻澶辫触锛?{updateError.message}`);
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
    throw new Error(`璇诲彇 worker 瀛愪换鍔″け璐ワ細${error.message}`);
  }

  const row = data as unknown as JoinedWorkerItemRow;
  const job = asSingle(row.image_jobs);
  const asset = asSingle(row.assets);

  if (!job || !asset) {
    throw new Error("worker 瀛愪换鍔＄己灏戜换鍔℃垨绱犳潗璁板綍");
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
    throw new Error(`璇诲彇绱犳潗澶辫触锛?{assetError.message}`);
  }

  const assets = (assetData ?? []) as unknown as AssetForWorker[];
  if (assets.length !== input.assetIds.length) {
    throw new Error("閮ㄥ垎绱犳潗涓嶅瓨鍦紝璇峰埛鏂板悗閲嶈瘯");
  }

  const missingOriginal = assets.find((asset) => !asset.original_url);
  if (missingOriginal) {
    throw new Error(`绱犳潗缂哄皯鍘熷浘鍦板潃锛?{missingOriginal.filename}`);
  }

  const options = buildOptions(input);
  const itemMultiplier = input.jobType === "fission"
    ? numberOption(input.options, "variant_count", 1, 1, 9)
    : 1;
  const totalCount = assets.length * itemMultiplier;
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .insert({
      failed_count: 0,
      job_type: input.jobType,
      options,
      status: "pending",
      success_count: 0,
      total_count: totalCount,
    })
    .select("id,job_type,status,total_count,success_count,failed_count")
    .single();

  if (jobError) {
    throw new Error(`鏈湴 worker 浠诲姟鍒涘缓澶辫触锛?{jobError.message}`);
  }

  const jobId = (jobData as unknown as { id: string }).id;
  const { error: itemError } = await supabase.from("image_job_items").insert(
    assets.flatMap((asset) =>
      Array.from({ length: itemMultiplier }, () => ({
        asset_id: asset.id,
        input_url: pickInputUrl(asset, input.jobType),
        job_id: jobId,
        status: "pending",
      })),
    ),
  );

  if (itemError) {
    await supabase
      .from("image_jobs")
      .update({
        error_message: itemError.message,
        failed_count: totalCount,
        status: "failed",
      })
      .eq("id", jobId);
    throw new Error(`鏈湴 worker 瀛愪换鍔″垱寤哄け璐ワ細${itemError.message}`);
  }

  if (input.jobType !== "fission") {
    await supabase.from("assets").update({ status: "processing" }).in(
      "id",
      assets.map((asset) => asset.id),
    );
  }

  return jobData;
}

export async function claimLocalWorkerItem(
  supabase: SupabaseServiceClient,
  jobTypes: LocalWorkerJobType[],
) {
  await recoverStaleWorkerItems(supabase, jobTypes);

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
    throw new Error(`棰嗗彇鏈湴 worker 浠诲姟澶辫触锛?{error.message}`);
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

    await supabase.from("image_jobs").update({ status: "processing" }).eq("id", row.job_id);

    if (job.job_type !== "fission") {
      await supabase.from("assets").update({ status: "processing" }).eq("id", row.asset_id);
    }

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

async function recoverStaleWorkerItems(
  supabase: SupabaseServiceClient,
  jobTypes: LocalWorkerJobType[],
) {
  if (jobTypes.length === 0) return;

  const { data, error } = await supabase
    .from("image_job_items")
    .select("id,image_jobs!inner(job_type,status)")
    .eq("status", "processing")
    .lt("updated_at", staleWorkerItemCutoff())
    .in("image_jobs.job_type", jobTypes)
    .in("image_jobs.status", ["pending", "processing"])
    .limit(25);

  if (error) {
    return;
  }

  const staleIds = ((data ?? []) as unknown as StaleWorkerItemRow[]).map((item) => item.id);
  if (staleIds.length === 0) return;

  await supabase
    .from("image_job_items")
    .update({
      error_message: null,
      status: "pending",
    })
    .in("id", staleIds);
}

export async function completeLocalWorkerItem(
  supabase: SupabaseServiceClient,
  itemId: string,
  input: CompleteLocalWorkerItemInput,
) {
  const { asset, item, job } = await getWorkerItem(supabase, itemId);
  const options = job.options ?? {};

  if (job.job_type === "resize" || job.job_type === "fission") {
    const outputUrl = await uploadFile(
      supabase,
      buildProcessedOutputPath(job.job_type, item.job_id, item.id, asset.filename, outputExtension(options, input.output)),
      input.output,
    );

    const { error: assetUpdateError } = await supabase
      .from("assets")
      .update({
        processed_url: outputUrl,
        status: "processed",
      })
      .eq("id", asset.id);

    if (assetUpdateError) {
      throw new Error(`${job.job_type} asset update failed: ${assetUpdateError.message}`);
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
      throw new Error(`${job.job_type} item update failed: ${itemUpdateError.message}`);
    }

    const jobCounts = await updateJobCounts(supabase, item.job_id);
    if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
      await archiveOldImageJobItems(supabase);
    }

    return {
      job: jobCounts,
      output_url: outputUrl,
    };
  }

  if (job.job_type === "mockup") {
    const templateId = stringOption(options, "template_id");
    const mockupOutputs = input.mockupOutputs?.length ? input.mockupOutputs : [input.output];

    if (!templateId) {
      throw new Error("mockup worker task is missing template_id");
    }

    if (mockupOutputs.length === 0) {
      throw new Error("mockup worker task has no output images");
    }

    const outputUrls: string[] = [];
    for (let index = 0; index < mockupOutputs.length; index += 1) {
      outputUrls.push(
        await uploadFile(
          supabase,
          buildMockupOutputPath(item.job_id, item.id, asset.filename, index),
          mockupOutputs[index],
        ),
      );
    }

    const { data: outputData, error: outputError } = await supabase
      .from("mockup_outputs")
      .insert({
        asset_id: asset.id,
        error_message: null,
        output_images: outputUrls,
        status: "completed",
        template_id: templateId,
      })
      .select("id")
      .single();

    if (outputError) {
      throw new Error(`mockup output save failed: ${outputError.message}`);
    }

    const { error: itemUpdateError } = await supabase
      .from("image_job_items")
      .update({
        error_message: null,
        output_url: outputUrls[0] ?? null,
        status: "completed",
      })
      .eq("id", item.id);

    if (itemUpdateError) {
      throw new Error(`mockup item update failed: ${itemUpdateError.message}`);
    }

    const jobCounts = await updateJobCounts(supabase, item.job_id);
    if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
      await archiveOldImageJobItems(supabase);
    }

    return {
      job: jobCounts,
      mockup_output_id: (outputData as unknown as { id: string }).id,
      output_images: outputUrls,
      output_url: outputUrls[0] ?? null,
    };
  }

  if (job.job_type === "infringement_check") {
    throw new Error("infringement_check task must be completed with a JSON detection payload");
  }

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
      throw new Error(`绮楁彁鍙栫粨鏋滀繚瀛樺け璐ワ細${rawDerivativeError.message}`);
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
    throw new Error(`澶勭悊缁撴灉淇濆瓨澶辫触锛?{derivativeError.message}`);
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
    throw new Error(`绱犳潗鏇存柊澶辫触锛?{assetUpdateError.message}`);
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
    throw new Error(`瀛愪换鍔℃洿鏂板け璐ワ細${itemUpdateError.message}`);
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

  if (job.job_type === "infringement_check") {
    const { error: itemUpdateError } = await supabase
      .from("image_job_items")
      .update({
        error_message: errorMessage,
        status: "failed",
      })
      .eq("id", item.id);

    if (itemUpdateError) {
      throw new Error(`infringement item fail update failed: ${itemUpdateError.message}`);
    }

    return updateJobCounts(supabase, item.job_id);
  }

  if (job.job_type === "resize" || job.job_type === "fission") {
    const { error: itemUpdateError } = await supabase
      .from("image_job_items")
      .update({
        error_message: errorMessage,
        status: "failed",
      })
      .eq("id", item.id);

    if (itemUpdateError) {
      throw new Error(`${job.job_type} item fail update failed: ${itemUpdateError.message}`);
    }

    if (job.job_type === "resize") {
      await supabase.from("assets").update({ status: "failed" }).eq("id", asset.id);
    }

    const jobCounts = await updateJobCounts(supabase, item.job_id);
    if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
      await archiveOldImageJobItems(supabase);
    }
    return jobCounts;
  }

  if (job.job_type === "mockup") {
    const templateId = stringOption(job.options ?? {}, "template_id");

    if (templateId) {
      await supabase.from("mockup_outputs").insert({
        asset_id: asset.id,
        error_message: errorMessage,
        output_images: [],
        status: "failed",
        template_id: templateId,
      });
    }

    const { error: itemUpdateError } = await supabase
      .from("image_job_items")
      .update({
        error_message: errorMessage,
        status: "failed",
      })
      .eq("id", item.id);

    if (itemUpdateError) {
      throw new Error(`mockup item fail update failed: ${itemUpdateError.message}`);
    }

    const jobCounts = await updateJobCounts(supabase, item.job_id);
    if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
      await archiveOldImageJobItems(supabase);
    }
    return jobCounts;
  }

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
    throw new Error(`瀛愪换鍔″け璐ョ姸鎬佹洿鏂板け璐ワ細${itemUpdateError.message}`);
  }

  await supabase.from("assets").update({ status: "failed" }).eq("id", asset.id);

  const jobCounts = await updateJobCounts(supabase, item.job_id);
  if (jobCounts.status === "completed" || jobCounts.status === "failed" || jobCounts.status === "partial_failed") {
    await archiveOldImageJobItems(supabase);
  }
  return jobCounts;
}
