import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import { generateImageWithFallback, resolveProvider } from "@/lib/ai-image/router";
import { resolveReferenceImageDataUrl } from "@/lib/ai-image/reference-image";
import { makeBackgroundTransparent } from "@/lib/image-processing/transparent-background";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type AiGenerateImageJobInput = {
  backgroundFeather: number;
  backgroundTolerance: number;
  backgroundTransparency: number;
  height: number;
  productDraftId: string | null;
  prompt: string;
  providerId?: string;
  referenceUrl?: string;
  routingProfile?: string;
  saveToAssets: boolean;
  style?: string;
  transparentBackground: boolean;
  width: number;
};

type AiImageJobRow = {
  id: string;
  provider_id: string;
  provider_type: string;
  model_id: string;
  prompt: string;
  width: number;
  height: number;
  style: string | null;
  status: string;
  request_options?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAiImageError(error: unknown) {
  const rawErrorMessage = error instanceof Error ? error.message : "生图失败";
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR|socket|connection/i.test(rawErrorMessage)
    ? "上游模型连接失败，系统已尝试可用模型 Key，请稍后点击重试"
    : rawErrorMessage;
}

function requestOptionsFromInput(input: AiGenerateImageJobInput) {
  return {
    background_feather: input.backgroundFeather,
    background_tolerance: input.backgroundTolerance,
    background_transparency: input.backgroundTransparency,
    product_draft_id: input.productDraftId,
    reference_url: input.referenceUrl,
    routing_profile: input.routingProfile,
    save_to_assets: input.saveToAssets,
    transparent_background: input.transparentBackground,
  };
}

function inputFromJobRow(row: AiImageJobRow): AiGenerateImageJobInput {
  const options = asRecord(row.request_options);

  return {
    backgroundFeather: optionalNumber(options.background_feather, 18, 0, 80),
    backgroundTolerance: optionalNumber(options.background_tolerance, 42, 1, 180),
    backgroundTransparency: optionalNumber(options.background_transparency, 100, 0, 100),
    height: row.height,
    productDraftId: optionalString(options.product_draft_id) ?? null,
    prompt: row.prompt,
    providerId: row.provider_id,
    referenceUrl: optionalString(options.reference_url),
    routingProfile: optionalString(options.routing_profile),
    saveToAssets: boolValue(options.save_to_assets, true),
    style: row.style ?? undefined,
    transparentBackground: boolValue(options.transparent_background, false),
    width: row.width,
  };
}

async function getAiImageJob(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .select("id,provider_id,provider_type,model_id,prompt,width,height,style,status,request_options")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(`读取 AI 生图任务失败：${error.message}`);
  }

  return data as unknown as AiImageJobRow;
}

async function updateAiImageProgress(
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
    .from("ai_image_jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) {
    throw new Error(`AI 任务进度回写失败: ${error.message}`);
  }
}

export async function createAiGenerateImageJob(
  supabase: SupabaseServiceClient,
  input: AiGenerateImageJobInput,
  status: "pending" | "processing" = "pending",
) {
  const resolved = await resolveProvider(input.providerId);
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .insert({
      error_message: null,
      height: input.height,
      model_id: resolved.modelId,
      negative_prompt: null,
      prompt: input.prompt,
      provider_id: resolved.id,
      provider_type: resolved.providerType,
      request_options: requestOptionsFromInput(input),
      status,
      style: input.style || null,
      width: input.width,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`创建 AI 任务失败: ${error.message}`);
  }

  const jobId = (data as unknown as { id?: string } | null)?.id;
  if (!jobId) {
    throw new Error("创建 AI 任务失败: 未返回任务 ID");
  }

  return {
    id: jobId,
    resolved,
  };
}

export async function claimAiGenerateImageJob(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .select("id,prompt")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`领取 AI 生图任务失败：${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ id: string; prompt: string }>) {
    const { data: claimed } = await supabase
      .from("ai_image_jobs")
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
      .select("id,prompt")
      .maybeSingle();

    if (claimed) {
      return {
        item_id: row.id,
        job_id: row.id,
        job_type: "ai_generate_image" as const,
        prompt: row.prompt,
      };
    }
  }

  return null;
}

export async function executeAiGenerateImageJob(
  supabase: SupabaseServiceClient,
  jobId: string,
) {
  const row = await getAiImageJob(supabase, jobId);
  const input = inputFromJobRow(row);

  try {
    await supabase
      .from("ai_image_jobs")
      .update({
        error_message: null,
        finished_at: null,
        progress_percent: 10,
        stage: "preparing",
        started_at: new Date().toISOString(),
        status: "processing",
      })
      .eq("id", jobId);

    const fastFallback = input.routingProfile === "grid_3x3_fast_fallback";
    if (input.referenceUrl && fastFallback) {
      await updateAiImageProgress(supabase, jobId, { progress_percent: 16, stage: "preparing_reference" });
    }
    const referenceDataUrl = input.referenceUrl && fastFallback
      ? await resolveReferenceImageDataUrl(input.referenceUrl)
      : undefined;
    await updateAiImageProgress(supabase, jobId, { progress_percent: 25, stage: "calling_ai" });
    const generation = await generateImageWithFallback(input.providerId, {
      height: input.height,
      prompt: input.prompt,
      referenceDataUrl,
      referenceUrl: input.referenceUrl,
      style: input.style,
      width: input.width,
    }, fastFallback ? { sameProviderRetryDelays: [] } : undefined);
    const result = generation.result;
    const finalProvider = generation.resolved;

    let resultUrl: string | null = null;
    let assetId: string | null = null;
    let outputBuffer: Buffer = Buffer.from(result.imageBase64, "base64");
    let outputMimeType = result.mimeType;

    await updateAiImageProgress(supabase, jobId, { progress_percent: 68, stage: "postprocessing" });

    if (input.transparentBackground) {
      await updateAiImageProgress(supabase, jobId, { progress_percent: 76, stage: "removing_background" });
      outputBuffer = await makeBackgroundTransparent(outputBuffer, {
        feather: input.backgroundFeather,
        tolerance: input.backgroundTolerance,
        transparency: input.backgroundTransparency,
      });
      outputMimeType = "image/png";
    }

    if (input.saveToAssets) {
      await updateAiImageProgress(supabase, jobId, { progress_percent: 86, stage: "saving_asset" });
      const ext = outputMimeType === "image/png" ? "png" : "jpg";
      const metadata = await sharp(outputBuffer).metadata();
      const outputWidth = metadata.width ?? input.width;
      const outputHeight = metadata.height ?? input.height;
      const datePath = new Date().toISOString().slice(0, 10);
      const storagePath = `${datePath}/ai-${randomUUID()}.${ext}`;

      resultUrl = (await saveLocalAssetAtPath({
        buffer: outputBuffer,
        relativePath: storagePath,
      })).publicUrl;

      const { data: asset, error: assetInsertError } = await supabase
        .from("assets")
        .insert({
          copyright_status: "owned",
          file_size: outputBuffer.length,
          filename: `ai-generated-${randomUUID().slice(0, 8)}.${ext}`,
          format: ext === "png" ? "png" : "jpeg",
          height: outputHeight,
          original_url: resultUrl,
          source: "ai",
          status: "uploaded",
          width: outputWidth,
        })
        .select("id")
        .single();

      if (assetInsertError) {
        await deleteLocalAssetByPublicUrl(resultUrl);
        throw new Error(`AI 结果写入素材库失败: ${assetInsertError.message}`);
      }

      assetId = asset.id;
    }

    if (input.productDraftId && assetId) {
      await updateAiImageProgress(supabase, jobId, { progress_percent: 94, stage: "updating_product" });
      const { data: draft, error: draftError } = await supabase
        .from("product_drafts")
        .select("images")
        .eq("id", input.productDraftId)
        .single();

      if (draftError) {
        throw new Error(`读取商品草稿失败: ${draftError.message}`);
      }

      if (draft) {
        const images = Array.isArray(draft.images) ? draft.images : [];
        images.push({ asset_id: assetId, created_at: new Date().toISOString(), source: "ai", url: resultUrl });
        const { error: draftUpdateError } = await supabase
          .from("product_drafts")
          .update({ images })
          .eq("id", input.productDraftId);

        if (draftUpdateError) {
          throw new Error(`更新商品草稿图片失败: ${draftUpdateError.message}`);
        }
      }
    }

    const { error: updateError } = await supabase
      .from("ai_image_jobs")
      .update({
        asset_id: assetId,
        attempts: generation.attempts,
        error_message: null,
        finished_at: new Date().toISOString(),
        model_id: finalProvider.modelId,
        progress_percent: 100,
        provider_id: finalProvider.id,
        provider_type: finalProvider.providerType,
        result_url: resultUrl,
        stage: "completed",
        status: "completed",
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(`AI 任务结果回写失败: ${updateError.message}`);
    }

    return {
      asset_id: assetId,
      attempts: generation.attempts,
      image_base64: input.saveToAssets ? undefined : outputBuffer.toString("base64"),
      job_id: jobId,
      mime_type: outputMimeType,
      model: finalProvider.modelId,
      product_draft_id: input.productDraftId,
      provider: finalProvider.providerType,
      result_url: resultUrl,
    };
  } catch (error) {
    const errorMessage = normalizeAiImageError(error);
    await supabase
      .from("ai_image_jobs")
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

export async function failAiGenerateImageJob(
  supabase: SupabaseServiceClient,
  jobId: string,
  errorMessage: string,
) {
  const { data, error } = await supabase
    .from("ai_image_jobs")
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
    throw new Error(`AI 生图任务失败状态回写失败：${error.message}`);
  }

  return data;
}
