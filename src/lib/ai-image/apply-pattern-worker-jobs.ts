import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import { generateImageWithFallback } from "@/lib/ai-image/router";
import { recoverStaleProcessingRows } from "@/lib/local-worker/stale-queue";
import { readImageBuffer } from "@/lib/network/image-buffer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ApplyPatternPosition = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type AiApplyPatternJobInput = {
  assetId: string | null;
  blendMode: "over" | "multiply";
  garmentUrl: string;
  opacity: number;
  position: ApplyPatternPosition | null;
  providerId?: string;
  referenceUrl?: string;
  styleDescription: string;
};

export type AiApplyPatternResult = {
  attempts: unknown[];
  composite_url: string;
  job_id?: string;
  model: string;
  pattern_url: string;
  provider: string;
};

type AiApplyPatternJobRow = {
  asset_id: string | null;
  blend_mode: string | null;
  garment_url: string;
  id: string;
  opacity: number | null;
  position: unknown;
  provider_id: string | null;
  reference_url: string | null;
  status: string;
  style_description: string;
};

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function parseApplyPatternPosition(value: unknown): ApplyPatternPosition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const x = Number(p.x);
  const y = Number(p.y);
  const width = Number(p.width);
  const height = Number(p.height);

  if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
    return { height, width, x, y };
  }

  return null;
}

function inputFromRow(row: AiApplyPatternJobRow): AiApplyPatternJobInput {
  return {
    assetId: row.asset_id,
    blendMode: row.blend_mode === "multiply" ? "multiply" : "over",
    garmentUrl: row.garment_url,
    opacity: numberValue(row.opacity, 100, 0, 100),
    position: parseApplyPatternPosition(row.position),
    providerId: row.provider_id ?? undefined,
    referenceUrl: row.reference_url ?? undefined,
    styleDescription: row.style_description,
  };
}

export async function executeApplyPattern(
  input: AiApplyPatternJobInput,
  onProgress?: (patch: { progress_percent: number; stage: string }) => Promise<void> | void,
): Promise<AiApplyPatternResult> {
  const garmentBuffer = await readImageBuffer(input.garmentUrl, {
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
  });
  const garmentMeta = await sharp(garmentBuffer).metadata();
  const garmentWidth = garmentMeta.width || 1024;
  const garmentHeight = garmentMeta.height || 1024;

  const patternWidth = input.position?.width || Math.round(garmentWidth * 0.4);
  const patternHeight = input.position?.height || Math.round(garmentHeight * 0.4);

  const prompt = [
    `Generate a print pattern design for clothing: ${input.styleDescription}.`,
    input.referenceUrl ? "Use the reference image as visual style and composition guidance." : "",
    "The pattern should be on a transparent or white background, suitable for printing on fabric. Clean edges, high quality. Square format.",
  ].filter(Boolean).join(" ");

  await onProgress?.({ progress_percent: 25, stage: "calling_ai" });
  const generation = await generateImageWithFallback(input.providerId, {
    height: patternHeight,
    prompt,
    referenceUrl: input.referenceUrl,
    width: patternWidth,
  });
  const result = generation.result;
  const resolved = generation.resolved;
  const patternBuffer = Buffer.from(result.imageBase64, "base64");

  await onProgress?.({ progress_percent: 70, stage: "compositing" });
  const patternResized = await sharp(patternBuffer)
    .resize(patternWidth, patternHeight, { fit: "contain", background: { alpha: 0, b: 0, g: 0, r: 0 } })
    .ensureAlpha()
    .toBuffer();

  let finalPattern = patternResized;
  if (input.opacity < 100) {
    const { data, info } = await sharp(patternResized).raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data.buffer);
    const factor = input.opacity / 100;
    for (let index = 3; index < pixels.length; index += 4) {
      pixels[index] = Math.round(pixels[index] * factor);
    }
    finalPattern = await sharp(Buffer.from(pixels.buffer), {
      raw: { channels: 4, height: info.height, width: info.width },
    }).png().toBuffer();
  }

  const left = input.position?.x ?? Math.round((garmentWidth - patternWidth) / 2);
  const top = input.position?.y ?? Math.round((garmentHeight - patternHeight) / 2);
  const composited = await sharp(garmentBuffer)
    .resize(garmentWidth, garmentHeight)
    .composite([{
      blend: input.blendMode,
      input: finalPattern,
      left,
      top,
    }])
    .png()
    .toBuffer();

  const supabase = createSupabaseServiceRoleClient();
  const datePath = new Date().toISOString().slice(0, 10);
  const id = randomUUID();
  const patternPath = `derivatives/${datePath}/${id}-ai-pattern.png`;
  const compositePath = `derivatives/${datePath}/${id}-applied.png`;

  await onProgress?.({ progress_percent: 88, stage: "saving_results" });
  const [patternSaved, compositeSaved] = await Promise.all([
    saveLocalAssetAtPath({ buffer: patternBuffer, relativePath: patternPath }),
    saveLocalAssetAtPath({ buffer: composited, relativePath: compositePath }),
  ]);
  const patternUrl = patternSaved.publicUrl;
  const compositeUrl = compositeSaved.publicUrl;

  if (input.assetId) {
    const { error: derivativeError } = await supabase.from("image_derivatives").insert({
      asset_id: input.assetId,
      derivative_type: "ai_applied_pattern",
      height: garmentHeight,
      options: {
        blend_mode: input.blendMode,
        opacity: input.opacity,
        position: input.position,
        provider: resolved.providerType,
        reference_url: input.referenceUrl || null,
        style_description: input.styleDescription,
      },
      output_url: compositeUrl,
      preview_url: compositeUrl,
      source_url: input.garmentUrl,
      status: "completed",
      width: garmentWidth,
    });

    if (derivativeError) {
      await Promise.all([deleteLocalAssetByPublicUrl(patternUrl), deleteLocalAssetByPublicUrl(compositeUrl)]);
      throw new Error(`套用印花记录写入失败: ${derivativeError.message}`);
    }
  }

  return {
    attempts: generation.attempts,
    composite_url: compositeUrl,
    model: resolved.modelId,
    pattern_url: patternUrl,
    provider: resolved.providerType,
  };
}

export async function createAiApplyPatternJob(
  supabase: SupabaseServiceClient,
  input: AiApplyPatternJobInput,
) {
  const { data, error } = await supabase
    .from("ai_apply_pattern_jobs")
    .insert({
      asset_id: input.assetId,
      blend_mode: input.blendMode,
      garment_url: input.garmentUrl,
      opacity: input.opacity,
      position: input.position,
      provider_id: input.providerId ?? null,
      reference_url: input.referenceUrl ?? null,
      status: "pending",
      style_description: input.styleDescription,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`创建贴图任务失败：${error.message}`);
  }

  const jobId = (data as unknown as { id?: string } | null)?.id;
  if (!jobId) {
    throw new Error("创建贴图任务失败：未返回任务 ID");
  }

  return { id: jobId };
}

export async function getAiApplyPatternJob(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("ai_apply_pattern_jobs")
    .select("id,garment_url,reference_url,asset_id,style_description,provider_id,position,opacity,blend_mode,status,result,error_message,stage,progress_percent,started_at,finished_at,created_at,updated_at")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(`读取贴图任务失败：${error.message}`);
  }

  return data;
}

async function updateAiApplyPatternProgress(
  supabase: SupabaseServiceClient,
  jobId: string,
  patch: {
    finished_at?: string | null;
    progress_percent?: number;
    stage?: string;
    started_at?: string | null;
    status?: string;
  },
) {
  const { error } = await supabase
    .from("ai_apply_pattern_jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) {
    throw new Error(`贴图任务进度回写失败：${error.message}`);
  }
}

export async function claimAiApplyPatternJob(supabase: SupabaseServiceClient) {
  await recoverStaleProcessingRows(supabase, {
    defaultMinutes: 60,
    envName: "LOCAL_WORKER_STALE_AI_MINUTES",
    table: "ai_apply_pattern_jobs",
    update: {
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      stage: "requeued",
      started_at: null,
      status: "pending",
    },
  });

  const { data, error } = await supabase
    .from("ai_apply_pattern_jobs")
    .select("id,style_description")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`领取贴图任务失败：${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ id: string; style_description: string }>) {
    const { data: claimed } = await supabase
      .from("ai_apply_pattern_jobs")
      .update({
        error_message: null,
        finished_at: null,
        progress_percent: 5,
        stage: "claimed",
        started_at: new Date().toISOString(),
        status: "processing",
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id,style_description")
      .maybeSingle();

    if (claimed) {
      return {
        item_id: row.id,
        job_id: row.id,
        job_type: "ai_apply_pattern" as const,
        prompt: row.style_description,
      };
    }
  }

  return null;
}

export async function executeAiApplyPatternJob(
  supabase: SupabaseServiceClient,
  jobId: string,
) {
  const row = await getAiApplyPatternJob(supabase, jobId) as unknown as AiApplyPatternJobRow;
  const input = inputFromRow(row);

  try {
    await supabase
      .from("ai_apply_pattern_jobs")
      .update({
        error_message: null,
        finished_at: null,
        progress_percent: 10,
        stage: "loading_garment",
        started_at: new Date().toISOString(),
        status: "processing",
      })
      .eq("id", jobId);

    const result = await executeApplyPattern(input, (patch) => updateAiApplyPatternProgress(supabase, jobId, patch));
    const resultWithJob = { ...result, job_id: jobId };
    const { error } = await supabase
      .from("ai_apply_pattern_jobs")
      .update({
        error_message: null,
        finished_at: new Date().toISOString(),
        progress_percent: 100,
        result: resultWithJob,
        stage: "completed",
        status: "completed",
      })
      .eq("id", jobId);

    if (error) {
      throw new Error(`贴图任务结果回写失败：${error.message}`);
    }

    return resultWithJob;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "贴图任务失败";
    await supabase
      .from("ai_apply_pattern_jobs")
      .update({
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
        progress_percent: 100,
        stage: "failed",
        status: "failed",
      })
      .eq("id", jobId);
    throw new Error(errorMessage);
  }
}

export async function failAiApplyPatternJob(
  supabase: SupabaseServiceClient,
  jobId: string,
  errorMessage: string,
) {
  const { data, error } = await supabase
    .from("ai_apply_pattern_jobs")
    .update({
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
      progress_percent: 100,
      stage: "failed",
      status: "failed",
    })
    .eq("id", jobId)
    .select("id,status,error_message")
    .single();

  if (error) {
    throw new Error(`贴图失败状态回写失败：${error.message}`);
  }

  return data;
}
