import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateImageWithFallback } from "@/lib/ai-image/router";
import { safeFetchBuffer } from "@/lib/network/safe-fetch";

export const runtime = "nodejs";
export const maxDuration = 120;

type GenerateAndApplyRequest = {
  garment_url?: unknown;
  reference_url?: unknown;
  asset_id?: unknown;
  style_description?: unknown;
  provider_id?: unknown;
  position?: unknown;
  opacity?: unknown;
  blend_mode?: unknown;
};

type Position = { x: number; y: number; width: number; height: number };

function parsePosition(value: unknown): Position | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const x = Number(p.x);
  const y = Number(p.y);
  const w = Number(p.width);
  const h = Number(p.height);
  if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
    return { x, y, width: w, height: h };
  }
  return null;
}

export async function POST(request: Request) {
  let body: GenerateAndApplyRequest;

  try {
    body = (await request.json()) as GenerateAndApplyRequest;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const garmentUrl = typeof body.garment_url === "string" ? body.garment_url.trim() : "";
  const referenceUrl = typeof body.reference_url === "string" ? body.reference_url.trim() : "";
  const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : null;
  const styleDescription = typeof body.style_description === "string" ? body.style_description.trim() : "";
  const providerId = typeof body.provider_id === "string" ? body.provider_id : undefined;
  const position = parsePosition(body.position);
  const opacity = typeof body.opacity === "number" ? Math.min(100, Math.max(0, body.opacity)) : 100;
  const blendMode = typeof body.blend_mode === "string" ? body.blend_mode : "over";

  if (!garmentUrl) {
    return NextResponse.json({ error: "请提供衣服模板图片 URL (garment_url)" }, { status: 400 });
  }
  if (!styleDescription) {
    return NextResponse.json({ error: "请描述想要的印花风格 (style_description)" }, { status: 400 });
  }

  try {
    const garmentBuffer = await safeFetchBuffer(garmentUrl, {
      allowedContentTypes: ["image/"],
      maxBytes: 25 * 1024 * 1024,
      timeoutMs: 30_000,
    });
    const garmentMeta = await sharp(garmentBuffer).metadata();
    const garmentWidth = garmentMeta.width || 1024;
    const garmentHeight = garmentMeta.height || 1024;

    const patternWidth = position?.width || Math.round(garmentWidth * 0.4);
    const patternHeight = position?.height || Math.round(garmentHeight * 0.4);

    const prompt = [
      `Generate a print pattern design for clothing: ${styleDescription}.`,
      referenceUrl ? "Use the reference image as visual style and composition guidance." : "",
      "The pattern should be on a transparent or white background, suitable for printing on fabric. Clean edges, high quality. Square format.",
    ].filter(Boolean).join(" ");

    const generation = await generateImageWithFallback(providerId, {
      prompt,
      referenceUrl: referenceUrl || undefined,
      width: patternWidth,
      height: patternHeight,
    });
    const result = generation.result;
    const resolved = generation.resolved;

    const patternBuffer = Buffer.from(result.imageBase64, "base64");

    const patternResized = await sharp(patternBuffer)
      .resize(patternWidth, patternHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .toBuffer();

    let finalPattern = patternResized;
    if (opacity < 100) {
      const { data, info } = await sharp(patternResized).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data.buffer);
      const factor = opacity / 100;
      for (let i = 3; i < pixels.length; i += 4) {
        pixels[i] = Math.round(pixels[i] * factor);
      }
      finalPattern = await sharp(Buffer.from(pixels.buffer), { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
    }

    const left = position?.x ?? Math.round((garmentWidth - patternWidth) / 2);
    const top = position?.y ?? Math.round((garmentHeight - patternHeight) / 2);

    const composited = await sharp(garmentBuffer)
      .resize(garmentWidth, garmentHeight)
      .composite([{
        input: finalPattern,
        left,
        top,
        blend: blendMode === "multiply" ? "multiply" : "over",
      }])
      .png()
      .toBuffer();

    const supabase = createSupabaseServiceRoleClient();
    const datePath = new Date().toISOString().slice(0, 10);
    const id = randomUUID();

    const patternPath = `derivatives/${datePath}/${id}-ai-pattern.png`;
    const compositePath = `derivatives/${datePath}/${id}-applied.png`;

    const [patternUpload, compositeUpload] = await Promise.all([
      supabase.storage.from("assets").upload(patternPath, patternBuffer, { contentType: "image/png", upsert: false }),
      supabase.storage.from("assets").upload(compositePath, composited, { contentType: "image/png", upsert: false }),
    ]);

    if (patternUpload.error) {
      throw new Error(`印花图上传失败: ${patternUpload.error.message}`);
    }
    if (compositeUpload.error) {
      throw new Error(`合成图上传失败: ${compositeUpload.error.message}`);
    }

    const patternUrl = supabase.storage.from("assets").getPublicUrl(patternPath).data.publicUrl;
    const compositeUrl = supabase.storage.from("assets").getPublicUrl(compositePath).data.publicUrl;

    if (assetId) {
      const { error: derivativeError } = await supabase.from("image_derivatives").insert({
        asset_id: assetId,
        derivative_type: "ai_applied_pattern",
        output_url: compositeUrl,
        preview_url: compositeUrl,
        source_url: garmentUrl,
        status: "completed",
        width: garmentWidth,
        height: garmentHeight,
        options: { reference_url: referenceUrl || null, style_description: styleDescription, provider: resolved.providerType, position, opacity, blend_mode: blendMode },
      });

      if (derivativeError) {
        await supabase.storage.from("assets").remove([patternPath, compositePath]);
        throw new Error(`套用印花记录写入失败: ${derivativeError.message}`);
      }
    }

    return NextResponse.json({
      pattern_url: patternUrl,
      composite_url: compositeUrl,
      attempts: generation.attempts,
      provider: resolved.providerType,
      model: resolved.modelId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成并贴图失败" },
      { status: 500 },
    );
  }
}
