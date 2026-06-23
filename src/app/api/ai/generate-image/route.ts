import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateImageWithFallback, resolveProvider } from "@/lib/ai-image/router";
import { makeBackgroundTransparent } from "@/lib/image-processing/transparent-background";
import { checkDailyImageQuota, logUsage } from "@/lib/auth/usage";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";
export const maxDuration = 420;

type GenerateImageRequest = {
  prompt?: unknown;
  width?: unknown;
  height?: unknown;
  style?: unknown;
  provider_id?: unknown;
  reference_url?: unknown;
  save_to_assets?: unknown;
  transparent_background?: unknown;
  background_tolerance?: unknown;
  background_feather?: unknown;
  background_transparency?: unknown;
  product_draft_id?: unknown;
};

function optionalNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const limit = optionalNumber(requestUrl.searchParams.get("limit"), 30, 1, 100);
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_image_jobs")
    .select("id, provider_type, model_id, prompt, width, height, status, result_url, asset_id, error_message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: `Failed to load generation history: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(request: Request) {
  let body: GenerateImageRequest;

  try {
    body = (await request.json()) as GenerateImageRequest;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return NextResponse.json({ error: "请填写生图提示词" }, { status: 400 });
  }

  const prompt = body.prompt.trim();
  const width = typeof body.width === "number" && body.width > 0 ? body.width : 1024;
  const height = typeof body.height === "number" && body.height > 0 ? body.height : 1024;
  const style = typeof body.style === "string" ? body.style.trim() : undefined;
  const providerId = typeof body.provider_id === "string" ? body.provider_id : undefined;
  const referenceUrl = typeof body.reference_url === "string" && body.reference_url.trim().length > 0 ? body.reference_url.trim() : undefined;
  const saveToAssets = body.save_to_assets !== false;
  const transparentBackground = body.transparent_background === true;
  const backgroundTolerance = optionalNumber(body.background_tolerance, 42, 1, 180);
  const backgroundFeather = optionalNumber(body.background_feather, 18, 0, 80);
  const backgroundTransparency = optionalNumber(body.background_transparency, 100, 0, 100);
  const productDraftId = typeof body.product_draft_id === "string" && body.product_draft_id.trim().length > 0
    ? body.product_draft_id.trim()
    : null;

  const quotaCheck = await checkDailyImageQuota(1);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      { error: quotaCheck.reason ?? "今日生图配额已用完", quota: quotaCheck.quota, used: quotaCheck.used },
      { status: 429 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  let resolved;
  try {
    resolved = await resolveProvider(providerId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法解析模型" },
      { status: 400 },
    );
  }

  const { data: job, error: jobError } = await supabase
    .from("ai_image_jobs")
    .insert({
      provider_id: resolved.id,
      provider_type: resolved.providerType,
      model_id: resolved.modelId,
      prompt,
      negative_prompt: null,
      width,
      height,
      style: style || null,
      status: "processing",
    })
    .select("id")
    .single();

  if (jobError) {
    return NextResponse.json({ error: `创建 AI 任务失败: ${jobError.message}` }, { status: 500 });
  }

  const jobId = job?.id;
  if (!jobId) {
    return NextResponse.json({ error: "创建 AI 任务失败: 未返回任务 ID" }, { status: 500 });
  }

  try {
    const generation = await generateImageWithFallback(providerId, {
      prompt,
      width,
      height,
      style,
      referenceUrl,
    });
    const result = generation.result;
    const finalProvider = generation.resolved;

    let resultUrl: string | null = null;
    let assetId: string | null = null;
    let outputBuffer: Buffer = Buffer.from(result.imageBase64, "base64");
    let outputMimeType = result.mimeType;

    if (transparentBackground) {
      outputBuffer = await makeBackgroundTransparent(outputBuffer, {
        feather: backgroundFeather,
        tolerance: backgroundTolerance,
        transparency: backgroundTransparency,
      });
      outputMimeType = "image/png";
    }

    if (saveToAssets) {
      const ext = outputMimeType === "image/png" ? "png" : "jpg";
      const metadata = await sharp(outputBuffer).metadata();
      const outputWidth = metadata.width ?? width;
      const outputHeight = metadata.height ?? height;
      const datePath = new Date().toISOString().slice(0, 10);
      const storagePath = `${datePath}/ai-${randomUUID()}.${ext}`;

      resultUrl = (await saveLocalAssetAtPath({
        buffer: outputBuffer,
        relativePath: storagePath,
      })).publicUrl;

      const { data: asset, error: assetInsertError } = await supabase
        .from("assets")
        .insert({
          original_url: resultUrl,
          filename: `ai-generated-${randomUUID().slice(0, 8)}.${ext}`,
          file_size: outputBuffer.length,
          width: outputWidth,
          height: outputHeight,
          format: ext === "png" ? "png" : "jpeg",
          source: "ai",
          status: "uploaded",
          copyright_status: "owned",
        })
        .select("id")
        .single();

      if (assetInsertError) {
        await deleteLocalAssetByPublicUrl(resultUrl);
        throw new Error(`AI 结果写入素材库失败: ${assetInsertError.message}`);
      }

      assetId = asset.id;
    }

    if (productDraftId && assetId) {
      const { data: draft, error: draftError } = await supabase
        .from("product_drafts")
        .select("images")
        .eq("id", productDraftId)
        .single();

      if (draftError) {
        throw new Error(`读取商品草稿失败: ${draftError.message}`);
      }

      if (draft) {
        const images = Array.isArray(draft.images) ? draft.images : [];
        images.push({ url: resultUrl, asset_id: assetId, source: "ai", created_at: new Date().toISOString() });
        const { error: draftUpdateError } = await supabase
          .from("product_drafts")
          .update({ images })
          .eq("id", productDraftId);

        if (draftUpdateError) {
          throw new Error(`更新商品草稿图片失败: ${draftUpdateError.message}`);
        }
      }
    }

    await supabase
      .from("ai_image_jobs")
      .update({
        asset_id: assetId,
        model_id: finalProvider.modelId,
        provider_id: finalProvider.id,
        provider_type: finalProvider.providerType,
        result_url: resultUrl,
        status: "completed",
      })
      .eq("id", jobId);

    await logUsage("ai_generate", 1, { job_id: jobId, model: finalProvider.modelId });
    await logUsage("api_call", 1, { endpoint: "ai/generate-image" });

    return NextResponse.json({
      job_id: jobId,
      asset_id: assetId,
      result_url: resultUrl,
      image_base64: saveToAssets ? undefined : outputBuffer.toString("base64"),
      mime_type: outputMimeType,
      attempts: generation.attempts,
      provider: finalProvider.providerType,
      model: finalProvider.modelId,
      product_draft_id: productDraftId,
    });
  } catch (error) {
    const rawErrorMessage = error instanceof Error ? error.message : "生图失败";
    const errorMessage = /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|UND_ERR|socket|connection/i.test(rawErrorMessage)
      ? "上游模型连接失败，系统已自动重试 3 次，请稍后点击重试"
      : rawErrorMessage;

    if (jobId) {
      await supabase
        .from("ai_image_jobs")
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", jobId);
    }

    return NextResponse.json({ error: errorMessage, job_id: jobId }, { status: 500 });
  }
}
