import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateImageWithFallback } from "@/lib/ai-image/router";
import { readImageBuffer } from "@/lib/network/image-buffer";
import { checkDailyImageQuota, logUsage } from "@/lib/auth/usage";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

type GenerateBackgroundRequest = {
  cutout_url?: unknown;
  asset_id?: unknown;
  scene_description?: unknown;
  provider_id?: unknown;
  width?: unknown;
  height?: unknown;
};

async function fetchImageBuffer(url: string): Promise<Buffer> {
  return readImageBuffer(url, {
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
  });
}

export async function POST(request: Request) {
  const quotaCheck = await checkDailyImageQuota(1);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      { error: quotaCheck.reason ?? "今日生图配额已用完" },
      { status: 429 },
    );
  }

  let body: GenerateBackgroundRequest;

  try {
    body = (await request.json()) as GenerateBackgroundRequest;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const cutoutUrl = typeof body.cutout_url === "string" ? body.cutout_url.trim() : "";
  const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : null;
  const sceneDescription = typeof body.scene_description === "string" ? body.scene_description.trim() : "";
  const providerId = typeof body.provider_id === "string" ? body.provider_id : undefined;

  if (!cutoutUrl) {
    return NextResponse.json({ error: "请提供抠图图片 URL (cutout_url)" }, { status: 400 });
  }
  if (!sceneDescription) {
    return NextResponse.json({ error: "请描述想要的背景场景 (scene_description)" }, { status: 400 });
  }

  try {
    const cutoutBuffer = await fetchImageBuffer(cutoutUrl);
    const cutoutMeta = await sharp(cutoutBuffer).metadata();
    const imgWidth = body.width && typeof body.width === "number" ? body.width : (cutoutMeta.width || 1024);
    const imgHeight = body.height && typeof body.height === "number" ? body.height : (cutoutMeta.height || 1024);

    const bgPrompt = `Generate a product photography background scene: ${sceneDescription}. The background should be clean and suitable for placing a product on top. No products or objects in the foreground. Resolution ${imgWidth}x${imgHeight}.`;

    const generation = await generateImageWithFallback(providerId, {
      prompt: bgPrompt,
      width: imgWidth,
      height: imgHeight,
    });
    const bgResult = generation.result;
    const resolved = generation.resolved;

    const bgBuffer = Buffer.from(bgResult.imageBase64, "base64");

    const composited = await sharp(bgBuffer)
      .resize(imgWidth, imgHeight, { fit: "cover" })
      .composite([{
        input: await sharp(cutoutBuffer).resize(imgWidth, imgHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(),
        gravity: "center",
      }])
      .png()
      .toBuffer();

    const supabase = createSupabaseServiceRoleClient();
    const datePath = new Date().toISOString().slice(0, 10);
    const id = randomUUID();

    const bgPath = `derivatives/${datePath}/${id}-ai-bg.png`;
    const compositePath = `derivatives/${datePath}/${id}-ai-composite.png`;

    const [bgUrl, compositeUrl] = await Promise.all([
      uploadToStorage(supabase, bgPath, bgBuffer),
      uploadToStorage(supabase, compositePath, composited),
    ]);

    if (assetId) {
      const { error: derivativeError } = await supabase.from("image_derivatives").insert({
        asset_id: assetId,
        derivative_type: "ai_background",
        output_url: compositeUrl,
        preview_url: compositeUrl,
        source_url: cutoutUrl,
        status: "completed",
        width: imgWidth,
        height: imgHeight,
        options: { scene_description: sceneDescription, provider: resolved.providerType },
      });

      if (derivativeError) {
        await Promise.all([deleteLocalAssetByPublicUrl(bgUrl), deleteLocalAssetByPublicUrl(compositeUrl)]);
        throw new Error(`背景衍生记录写入失败: ${derivativeError.message}`);
      }
    }

    await logUsage("ai_generate", 1, { endpoint: "ai/generate-background", model: resolved.modelId });
    await logUsage("api_call", 1, { endpoint: "ai/generate-background" });

    return NextResponse.json({
      background_url: bgUrl,
      composite_url: compositeUrl,
      attempts: generation.attempts,
      provider: resolved.providerType,
      model: resolved.modelId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "背景生成失败" },
      { status: 500 },
    );
  }
}

async function uploadToStorage(
  _supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  path: string,
  buffer: Buffer,
) {
  return (await saveLocalAssetAtPath({
    buffer,
    relativePath: path,
  })).publicUrl;
}
