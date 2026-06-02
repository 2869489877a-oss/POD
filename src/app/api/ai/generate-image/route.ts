import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateImage, resolveProvider } from "@/lib/ai-image/router";

export const runtime = "nodejs";
export const maxDuration = 120;

type GenerateImageRequest = {
  prompt?: unknown;
  negative_prompt?: unknown;
  width?: unknown;
  height?: unknown;
  style?: unknown;
  provider_id?: unknown;
  reference_url?: unknown;
  save_to_assets?: unknown;
  product_draft_id?: unknown;
};

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
  const negativePrompt = typeof body.negative_prompt === "string" ? body.negative_prompt.trim() : undefined;
  const width = typeof body.width === "number" && body.width > 0 ? body.width : 1024;
  const height = typeof body.height === "number" && body.height > 0 ? body.height : 1024;
  const style = typeof body.style === "string" ? body.style.trim() : undefined;
  const providerId = typeof body.provider_id === "string" ? body.provider_id : undefined;
  const referenceUrl = typeof body.reference_url === "string" && body.reference_url.trim().length > 0 ? body.reference_url.trim() : undefined;
  const saveToAssets = body.save_to_assets !== false;
  const productDraftId = typeof body.product_draft_id === "string" && body.product_draft_id.trim().length > 0
    ? body.product_draft_id.trim()
    : null;

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

  const { data: job } = await supabase
    .from("ai_image_jobs")
    .insert({
      provider_id: resolved.id,
      provider_type: resolved.providerType,
      model_id: resolved.modelId,
      prompt,
      negative_prompt: negativePrompt || null,
      width,
      height,
      style: style || null,
      status: "processing",
    })
    .select("id")
    .single();

  const jobId = job?.id;

  try {
    const result = await generateImage(resolved, {
      prompt,
      negativePrompt,
      width,
      height,
      style,
      referenceUrl,
    });

    let resultUrl: string | null = null;
    let assetId: string | null = null;

    if (saveToAssets) {
      const buffer = Buffer.from(result.imageBase64, "base64");
      const ext = result.mimeType === "image/png" ? "png" : "jpg";
      const metadata = await sharp(buffer).metadata();
      const outputWidth = metadata.width ?? width;
      const outputHeight = metadata.height ?? height;
      const datePath = new Date().toISOString().slice(0, 10);
      const storagePath = `${datePath}/ai-${randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(storagePath, buffer, {
          contentType: result.mimeType,
          upsert: false,
        });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from("assets")
          .getPublicUrl(storagePath);

        resultUrl = publicUrlData.publicUrl;

        const { data: asset } = await supabase
          .from("assets")
          .insert({
            original_url: resultUrl,
            filename: `ai-generated-${randomUUID().slice(0, 8)}.${ext}`,
            file_size: buffer.length,
            width: outputWidth,
            height: outputHeight,
            format: ext === "png" ? "png" : "jpeg",
            source: "ai",
            status: "uploaded",
            copyright_status: "owned",
          })
          .select("id")
          .single();

        assetId = asset?.id ?? null;
      }
    }

    if (jobId) {
      await supabase
        .from("ai_image_jobs")
        .update({ status: "completed", result_url: resultUrl, asset_id: assetId })
        .eq("id", jobId);
    }

    if (productDraftId && assetId) {
      const { data: draft } = await supabase
        .from("product_drafts")
        .select("images")
        .eq("id", productDraftId)
        .single();

      if (draft) {
        const images = Array.isArray(draft.images) ? draft.images : [];
        images.push({ url: resultUrl, asset_id: assetId, source: "ai", created_at: new Date().toISOString() });
        await supabase
          .from("product_drafts")
          .update({ images })
          .eq("id", productDraftId);
      }
    }

    return NextResponse.json({
      job_id: jobId,
      asset_id: assetId,
      result_url: resultUrl,
      image_base64: saveToAssets ? undefined : result.imageBase64,
      mime_type: result.mimeType,
      provider: resolved.providerType,
      model: resolved.modelId,
      product_draft_id: productDraftId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "生图失败";

    if (jobId) {
      await supabase
        .from("ai_image_jobs")
        .update({ status: "failed", error_message: errorMessage })
        .eq("id", jobId);
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
