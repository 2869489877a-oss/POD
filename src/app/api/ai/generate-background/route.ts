import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateImage, resolveProvider } from "@/lib/ai-image/router";

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
  const response = await fetch(url);
  if (!response.ok) throw new Error("无法下载抠图图片");
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) {
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

    const resolved = await resolveProvider(providerId);

    const bgPrompt = `Generate a product photography background scene: ${sceneDescription}. The background should be clean and suitable for placing a product on top. No products or objects in the foreground. Resolution ${imgWidth}x${imgHeight}.`;

    const bgResult = await generateImage(resolved, {
      prompt: bgPrompt,
      width: imgWidth,
      height: imgHeight,
    });

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
      uploadToStorage(supabase, bgPath, bgBuffer, "image/png"),
      uploadToStorage(supabase, compositePath, composited, "image/png"),
    ]);

    if (assetId) {
      await supabase.from("image_derivatives").insert({
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
    }

    return NextResponse.json({
      background_url: bgUrl,
      composite_url: compositeUrl,
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

function uploadToStorage(supabase: ReturnType<typeof createSupabaseServiceRoleClient>, path: string, buffer: Buffer, contentType: string) {
  return supabase.storage.from("assets").upload(path, buffer, { contentType, upsert: false })
    .then(({ error }) => {
      if (error) throw new Error(`上传失败: ${error.message}`);
      return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
    });
}
