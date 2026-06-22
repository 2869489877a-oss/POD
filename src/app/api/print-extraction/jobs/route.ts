import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { extractPrintFromImage } from "@/lib/image-ai/print-extraction";
import type { PrintExtractionMode, ProcessingBBox } from "@/lib/image-ai/types";
import { createLocalWorkerImageJob } from "@/lib/local-worker/image-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { logUsage } from "@/lib/auth/usage";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type AssetRecord = {
  filename: string | null;
  id: string;
  original_url: string | null;
};

type PrintExtractionJobRequest = {
  assetIds?: unknown;
  asset_ids?: unknown;
  execution?: unknown;
  localWorker?: unknown;
  local_worker?: unknown;
  manualRects?: unknown;
  manual_rect?: unknown;
  mode?: unknown;
  options?: unknown;
  setPreferred?: unknown;
  set_preferred?: unknown;
};

type CompletedPrintExtractionResult = {
  asset_id: string;
  derivative_id: string | null;
  filename: string | null;
  final_url: string;
  input_url: string;
  mask_url: string;
  metrics: Record<string, unknown>;
  preview_url: string;
  raw_url: string;
  status: "completed";
};

type FailedPrintExtractionResult = {
  asset_id: string;
  error_message: string;
  filename?: string | null;
  status: "failed";
};

type PrintExtractionResultItem = CompletedPrintExtractionResult | FailedPrintExtractionResult;

const allowedModes = new Set<PrintExtractionMode>([
  "auto",
  "light_garment",
  "dark_garment",
  "high_contrast",
  "manual_rect",
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

function getMode(value: unknown): PrintExtractionMode | null {
  return typeof value === "string" && allowedModes.has(value as PrintExtractionMode)
    ? (value as PrintExtractionMode)
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

function shouldQueueForLocalWorker(body: PrintExtractionJobRequest): boolean {
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

function parseManualRect(value: unknown): ProcessingBBox | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return undefined;
  }

  return { height, width, x, y };
}

async function uploadImage(
  _supabase: SupabaseServiceClient,
  path: string,
  buffer: Buffer,
  _contentType: string,
): Promise<string> {
  return (await saveLocalAssetAtPath({
    buffer,
    relativePath: path,
  })).publicUrl;
}

async function processAsset(
  supabase: SupabaseServiceClient,
  asset: AssetRecord,
  mode: PrintExtractionMode,
  manualRects: Record<string, unknown>,
  options: Record<string, unknown>,
  setPreferred: boolean,
): Promise<PrintExtractionResultItem> {
  try {
    if (!asset.original_url) {
      throw new Error("Asset is missing original_url");
    }

    const manualRect = mode === "manual_rect" ? parseManualRect(manualRects[asset.id]) : undefined;

    if (mode === "manual_rect" && !manualRect) {
      throw new Error("manual_rect mode requires a valid rectangle for this asset");
    }

    const result = await extractPrintFromImage({
      imageUrl: asset.original_url,
      manualRect,
      mode,
      options: {
        featherRadius: optionalNumber(options.featherRadius, 1),
        maxSize: optionalNumber(options.maxSize, 1800),
        minComponentArea: optionalNumber(options.minComponentArea, 80),
        padding: optionalNumber(options.padding, 40),
        preserveBlackInk: optionalBoolean(options.preserveBlackInk, true),
        preserveWhiteInk: optionalBoolean(options.preserveWhiteInk, true),
      },
    });
    const folder = dateFolder();
    const id = randomUUID();
    const rawPath = `derivatives/${folder}/${id}-print-raw.png`;
    const finalPath = `derivatives/${folder}/${id}-print-final.png`;
    const previewPath = `derivatives/${folder}/${id}-preview.jpg`;
    const maskPath = `derivatives/${folder}/${id}-mask.png`;
    const [rawUrl, finalUrl, previewUrl, maskUrl] = await Promise.all([
      uploadImage(supabase, rawPath, result.rawPng, "image/png"),
      uploadImage(supabase, finalPath, result.finalPng, "image/png"),
      uploadImage(supabase, previewPath, result.previewJpg, "image/jpeg"),
      uploadImage(supabase, maskPath, result.maskPng, "image/png"),
    ]);

    const { data: derivativeRows, error: derivativeError } = await supabase
      .from("image_derivatives")
      .insert([
        {
          asset_id: asset.id,
          bbox: result.bbox,
          derivative_type: "print_extract_raw",
          height: result.height,
          mask_url: maskUrl,
          metrics: result.metrics,
          options: { manualRect, mode, ...options },
          output_url: rawUrl,
          preview_url: previewUrl,
          source_url: asset.original_url,
          status: "completed",
          width: result.width,
        },
        {
          asset_id: asset.id,
          bbox: result.bbox,
          derivative_type: "print_extract_final",
          height: result.height,
          mask_url: maskUrl,
          metrics: result.metrics,
          options: { manualRect, mode, ...options },
          output_url: finalUrl,
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
          options: { manualRect, mode, ...options },
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
          options: { manualRect, mode, ...options },
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
      ? { preferred_design_url: finalUrl, print_extract_url: finalUrl }
      : { print_extract_url: finalUrl };
    const { error: assetUpdateError } = await supabase.from("assets").update(updatePayload).eq("id", asset.id);

    if (assetUpdateError) {
      throw new Error(`Failed to update asset print_extract_url: ${assetUpdateError.message}`);
    }

    return {
      asset_id: asset.id,
      derivative_id: derivativeRows?.find((row) => row.derivative_type === "print_extract_final")?.id ?? null,
      filename: asset.filename,
      final_url: finalUrl,
      input_url: asset.original_url,
      mask_url: maskUrl,
      metrics: result.metrics,
      preview_url: previewUrl,
      raw_url: rawUrl,
      status: "completed",
    };
  } catch (error) {
    return {
      asset_id: asset.id,
      error_message: error instanceof Error ? error.message : "Print extraction failed",
      filename: asset.filename,
      status: "failed",
    };
  }
}

export async function POST(request: Request) {
  let body: PrintExtractionJobRequest;

  try {
    body = (await request.json()) as PrintExtractionJobRequest;
  } catch {
    return NextResponse.json({ error: "Invalid print extraction request body" }, { status: 400 });
  }

  const assetIds = getUniqueAssetIds(body.assetIds ?? body.asset_ids);
  const mode = getMode(body.mode);
  const manualRects = isRecord(body.manualRects) ? body.manualRects : {};
  const legacyManualRect = parseManualRect(body.manual_rect);
  const options = isRecord(body.options) ? body.options : {};
  const setPreferred = optionalBoolean(body.setPreferred ?? body.set_preferred, false);

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "assetIds must contain at least one asset id" }, { status: 400 });
  }

  if (!mode) {
    return NextResponse.json({ error: "Invalid print extraction mode" }, { status: 400 });
  }

  if (legacyManualRect && assetIds.length > 0) {
    manualRects[assetIds[0]] = legacyManualRect;
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const normalizedOptions = {
      featherRadius: optionalNumber(options.featherRadius, 1),
      maxSize: optionalNumber(options.maxSize, 1800),
      minComponentArea: optionalNumber(options.minComponentArea, 80),
      padding: optionalNumber(options.padding, 40),
      preserveBlackInk: optionalBoolean(options.preserveBlackInk, true),
      preserveWhiteInk: optionalBoolean(options.preserveWhiteInk, true),
    };

    if (shouldQueueForLocalWorker(body)) {
      const job = await createLocalWorkerImageJob(supabase, {
        assetIds,
        jobType: "print_extraction",
        manualRects,
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
    const results: PrintExtractionResultItem[] = [];

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

      results.push(await processAsset(supabase, asset, mode, manualRects, options, setPreferred));
    }

    const success = results.filter((result) => result.status === "completed").length;
    const failed = results.length - success;

    if (success > 0) {
      await logUsage("print_extract", success, { mode });
      await logUsage("api_call", 1, { endpoint: "print-extraction/jobs" });
    }

    return NextResponse.json({
      failed,
      ok: true,
      results,
      success,
      total: results.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create print extraction job" },
      { status: 500 },
    );
  }
}
