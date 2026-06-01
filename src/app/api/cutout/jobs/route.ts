import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { cutoutImage } from "@/lib/image-ai/cutout";
import type { CutoutMode } from "@/lib/image-ai/types";
import { createLocalWorkerImageJob } from "@/lib/local-worker/image-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ASSETS_BUCKET = "assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type AssetRecord = {
  filename: string | null;
  id: string;
  original_url: string | null;
};

type CutoutJobRequest = {
  assetIds?: unknown;
  asset_ids?: unknown;
  execution?: unknown;
  localWorker?: unknown;
  local_worker?: unknown;
  mode?: unknown;
  options?: unknown;
  setPreferred?: unknown;
  set_preferred?: unknown;
};

type CompletedCutoutResult = {
  asset_id: string;
  cutout_url: string;
  derivative_id: string | null;
  filename: string | null;
  input_url: string;
  mask_url: string;
  metrics: Record<string, unknown>;
  preview_url: string;
  status: "completed";
};

type FailedCutoutResult = {
  asset_id: string;
  error_message: string;
  filename?: string | null;
  status: "failed";
};

type CutoutResult = CompletedCutoutResult | FailedCutoutResult;

const allowedModes = new Set<CutoutMode>([
  "auto_background",
  "white_background",
  "black_background",
  "solid_background",
  "edge_flood_fill",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUniqueAssetIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

function getMode(value: unknown): CutoutMode | null {
  return typeof value === "string" && allowedModes.has(value as CutoutMode)
    ? (value as CutoutMode)
    : null;
}

function optionalNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function shouldQueueForLocalWorker(body: CutoutJobRequest): boolean {
  return (
    process.env.LOCAL_IMAGE_WORKER_ENABLED === "true" ||
    body.execution === "local_worker" ||
    body.localWorker === true ||
    body.local_worker === true
  );
}

function dateFolder(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPublicUrl(supabase: SupabaseServiceClient, path: string): string {
  return supabase.storage.from(ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadImage(
  supabase: SupabaseServiceClient,
  path: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, buffer, {
    cacheControl: "31536000",
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`Failed to upload generated image: ${error.message}`);
  }

  return getPublicUrl(supabase, path);
}

async function processAsset(
  supabase: SupabaseServiceClient,
  asset: AssetRecord,
  mode: CutoutMode,
  options: Record<string, unknown>,
  setPreferred: boolean,
): Promise<CutoutResult> {
  try {
    if (!asset.original_url) {
      throw new Error("Asset is missing original_url");
    }

    const result = await cutoutImage({
      imageUrl: asset.original_url,
      mode,
      options: {
        cropToContent: optionalBoolean(options.cropToContent, true),
        featherRadius: optionalNumber(options.featherRadius, 1),
        maxSize: optionalNumber(options.maxSize, 1800),
        padding: optionalNumber(options.padding, 20),
        tolerance: optionalNumber(options.tolerance, 35),
      },
    });
    const folder = dateFolder();
    const id = randomUUID();
    const cutoutPath = `derivatives/${folder}/${id}-cutout.png`;
    const previewPath = `derivatives/${folder}/${id}-preview.jpg`;
    const maskPath = `derivatives/${folder}/${id}-mask.png`;
    const [cutoutUrl, previewUrl, maskUrl] = await Promise.all([
      uploadImage(supabase, cutoutPath, result.cutoutPng, "image/png"),
      uploadImage(supabase, previewPath, result.previewJpg, "image/jpeg"),
      uploadImage(supabase, maskPath, result.maskPng, "image/png"),
    ]);

    const { data: derivativeRows, error: derivativeError } = await supabase
      .from("image_derivatives")
      .insert([
        {
          asset_id: asset.id,
          bbox: result.bbox,
          derivative_type: "cutout",
          height: result.height,
          mask_url: maskUrl,
          metrics: result.metrics,
          options: { mode, ...options },
          output_url: cutoutUrl,
          preview_url: previewUrl,
          source_url: asset.original_url,
          status: "completed",
          width: result.width,
        },
        {
          asset_id: asset.id,
          bbox: result.bbox,
          derivative_type: "preview",
          height: result.height,
          metrics: result.metrics,
          options: { mode, ...options },
          output_url: previewUrl,
          preview_url: previewUrl,
          source_url: asset.original_url,
          status: "completed",
          width: result.width,
        },
        {
          asset_id: asset.id,
          bbox: result.bbox,
          derivative_type: "mask",
          height: result.height,
          mask_url: maskUrl,
          metrics: result.metrics,
          options: { mode, ...options },
          output_url: maskUrl,
          source_url: asset.original_url,
          status: "completed",
          width: result.width,
        },
      ])
      .select("id,derivative_type");

    if (derivativeError) {
      throw new Error(`Failed to save derivative rows: ${derivativeError.message}`);
    }

    const updatePayload = setPreferred
      ? { cutout_url: cutoutUrl, preferred_design_url: cutoutUrl }
      : { cutout_url: cutoutUrl };
    const { error: assetUpdateError } = await supabase.from("assets").update(updatePayload).eq("id", asset.id);

    if (assetUpdateError) {
      throw new Error(`Failed to update asset cutout_url: ${assetUpdateError.message}`);
    }

    return {
      asset_id: asset.id,
      cutout_url: cutoutUrl,
      derivative_id: derivativeRows?.find((row) => row.derivative_type === "cutout")?.id ?? null,
      filename: asset.filename,
      input_url: asset.original_url,
      mask_url: maskUrl,
      metrics: result.metrics,
      preview_url: previewUrl,
      status: "completed",
    };
  } catch (error) {
    return {
      asset_id: asset.id,
      error_message: error instanceof Error ? error.message : "Cutout processing failed",
      filename: asset.filename,
      status: "failed",
    };
  }
}

export async function POST(request: Request) {
  let body: CutoutJobRequest;

  try {
    body = (await request.json()) as CutoutJobRequest;
  } catch {
    return NextResponse.json({ error: "Invalid cutout request body" }, { status: 400 });
  }

  const assetIds = getUniqueAssetIds(body.assetIds ?? body.asset_ids);
  const mode = getMode(body.mode);
  const options = isRecord(body.options) ? body.options : {};
  const setPreferred = optionalBoolean(body.setPreferred ?? body.set_preferred, false);

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "assetIds must contain at least one asset id" }, { status: 400 });
  }

  if (!mode) {
    return NextResponse.json({ error: "Invalid cutout mode" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const normalizedOptions = {
      cropToContent: optionalBoolean(options.cropToContent, true),
      featherRadius: optionalNumber(options.featherRadius, 1),
      maxSize: optionalNumber(options.maxSize, 1800),
      padding: optionalNumber(options.padding, 20),
      tolerance: optionalNumber(options.tolerance, 35),
    };

    if (shouldQueueForLocalWorker(body)) {
      const job = await createLocalWorkerImageJob(supabase, {
        assetIds,
        jobType: "cutout",
        mode,
        options: normalizedOptions,
        setPreferred,
      });

      return NextResponse.json({
        failed: 0,
        job,
        job_id: (job as { id: string }).id,
        ok: true,
        queued: true,
        results: [],
        success: 0,
        total: assetIds.length,
      });
    }

    const { data, error } = await supabase
      .from("assets")
      .select("id,filename,original_url")
      .in("id", assetIds);

    if (error) {
      throw new Error(`Failed to read assets: ${error.message}`);
    }

    const assetMap = new Map(((data ?? []) as AssetRecord[]).map((asset) => [asset.id, asset]));
    const results: CutoutResult[] = [];

    for (const assetId of assetIds) {
      const asset = assetMap.get(assetId);

      if (!asset) {
        results.push({
          asset_id: assetId,
          error_message: "Asset record not found",
          status: "failed",
        });
        continue;
      }

      results.push(await processAsset(supabase, asset, mode, options, setPreferred));
    }

    const success = results.filter((result) => result.status === "completed").length;
    const failed = results.length - success;

    return NextResponse.json({
      failed,
      ok: true,
      results,
      success,
      total: results.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create cutout job" },
      { status: 500 },
    );
  }
}
