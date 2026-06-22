import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateImageWithFallback } from "@/lib/ai-image/router";
import { checkDailyImageQuota, logUsage } from "@/lib/auth/usage";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

type GeneratePatternRequest = {
  reference_url?: unknown;
  asset_id?: unknown;
  style_description?: unknown;
  provider_id?: unknown;
  width?: unknown;
  height?: unknown;
};

export async function POST(request: Request) {
  const quotaCheck = await checkDailyImageQuota(1);
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      { error: quotaCheck.reason ?? "今日生图配额已用完" },
      { status: 429 },
    );
  }

  let body: GeneratePatternRequest;

  try {
    body = (await request.json()) as GeneratePatternRequest;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const referenceUrl = typeof body.reference_url === "string" ? body.reference_url.trim() : "";
  const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : null;
  const styleDescription = typeof body.style_description === "string" ? body.style_description.trim() : "";
  const providerId = typeof body.provider_id === "string" ? body.provider_id : undefined;
  const width = typeof body.width === "number" && body.width > 0 ? body.width : 1024;
  const height = typeof body.height === "number" && body.height > 0 ? body.height : 1024;

  if (!styleDescription) {
    return NextResponse.json({ error: "请描述想要的印花风格 (style_description)" }, { status: 400 });
  }

  try {
    let prompt = `Generate a seamless print pattern design for clothing/apparel: ${styleDescription}. The pattern should have a transparent or solid color background, suitable for printing on fabric. High quality, clean edges, vector-like quality.`;

    if (referenceUrl) {
      prompt += ` Style reference: the pattern should be similar in style to an existing extracted print pattern.`;
    }

    const generation = await generateImageWithFallback(providerId, {
      prompt,
      referenceUrl: referenceUrl || undefined,
      width,
      height,
    });
    const result = generation.result;
    const resolved = generation.resolved;

    const supabase = createSupabaseServiceRoleClient();
    const buffer = Buffer.from(result.imageBase64, "base64");
    const datePath = new Date().toISOString().slice(0, 10);
    const storagePath = `derivatives/${datePath}/${randomUUID()}-ai-pattern.png`;

    const patternUrl = (await saveLocalAssetAtPath({
      buffer,
      relativePath: storagePath,
    })).publicUrl;

    const { data: newAsset, error: assetInsertError } = await supabase
      .from("assets")
      .insert({
        original_url: patternUrl,
        filename: `ai-pattern-${randomUUID().slice(0, 8)}.png`,
        file_size: buffer.length,
        width,
        height,
        format: "png",
        source: "ai",
        status: "uploaded",
        copyright_status: "owned",
      })
      .select("id")
      .single();

    if (assetInsertError) {
      await deleteLocalAssetByPublicUrl(patternUrl);
      throw new Error(`素材写入失败: ${assetInsertError.message}`);
    }

    if (!newAsset?.id) {
      await deleteLocalAssetByPublicUrl(patternUrl);
      throw new Error("素材写入失败: 未返回素材 ID");
    }

    if (assetId) {
      const { error: derivativeError } = await supabase.from("image_derivatives").insert({
        asset_id: assetId,
        derivative_type: "ai_pattern",
        output_url: patternUrl,
        preview_url: patternUrl,
        source_url: referenceUrl || null,
        status: "completed",
        width,
        height,
        options: { generated_asset_id: newAsset.id, style_description: styleDescription, provider: resolved.providerType },
      });

      if (derivativeError) {
        await deleteLocalAssetByPublicUrl(patternUrl);
        await supabase.from("assets").delete().eq("id", newAsset.id);
        throw new Error(`印花衍生记录写入失败: ${derivativeError.message}`);
      }
    }

    await logUsage("ai_generate", 1, { endpoint: "ai/generate-pattern", model: resolved.modelId });
    await logUsage("api_call", 1, { endpoint: "ai/generate-pattern" });

    return NextResponse.json({
      pattern_url: patternUrl,
      asset_id: newAsset.id,
      attempts: generation.attempts,
      provider: resolved.providerType,
      model: resolved.modelId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "印花生成失败" },
      { status: 500 },
    );
  }
}
