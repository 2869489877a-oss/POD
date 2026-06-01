import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import { validateScenes, type MockupScene } from "@/lib/mockups/scenes";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ASSETS_BUCKET = "assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type AssetForMockup = {
  filename: string;
  id: string;
  original_url: string;
  processed_url: string | null;
};

type MockupTemplateForJob = {
  id: string;
  name: string;
  product_type: string;
  scenes: unknown;
};

type ImageJobItemForMockup = {
  asset_id: string;
  id: string;
  input_url: string;
};

export type MockupOutputResult = {
  asset_id: string;
  error_message: string | null;
  filename: string;
  item_id: string;
  mockup_output_id: string | null;
  output_images: string[];
  status: "completed" | "failed";
};

export type MockupJobResult = {
  failed_count: number;
  id: string;
  outputs: MockupOutputResult[];
  status: "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-") || "image";
}

async function downloadImage(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function uploadMockupScene(
  supabase: SupabaseServiceClient,
  jobId: string,
  asset: AssetForMockup,
  scene: MockupScene,
  outputBuffer: Buffer,
) {
  const datePath = new Date().toISOString().slice(0, 10);
  const filename = sanitizeFilename(asset.filename).replace(/\.[^.]+$/, "");
  const sceneName = sanitizeFilename(scene.name);
  const outputPath = `mockup-outputs/${datePath}/${jobId}/${asset.id}/${randomUUID()}-${filename}-${sceneName}.png`;

  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(outputPath, outputBuffer, {
    contentType: "image/png",
    upsert: false,
  });

  if (error) {
    throw new Error(`套图上传失败：${error.message}`);
  }

  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(outputPath);
  return data.publicUrl;
}

async function renderScene(scene: MockupScene, backgroundBuffer: Buffer, printBuffer: Buffer) {
  let image = sharp(backgroundBuffer)
    .rotate()
    .resize(scene.output_width, scene.output_height, {
      fit: "cover",
      position: "center",
    });

  if (scene.need_print && scene.print_area) {
    const printLayer = await sharp(printBuffer)
      .rotate()
      .resize(Math.round(scene.print_area.width), Math.round(scene.print_area.height), {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        fit: "contain",
        position: "center",
      })
      .png()
      .toBuffer();

    image = image.composite([
      {
        input: printLayer,
        left: Math.round(scene.print_area.x),
        top: Math.round(scene.print_area.y),
      },
    ]);
  }

  return image.png().toBuffer();
}

async function renderMockupImagesForAsset(
  supabase: SupabaseServiceClient,
  jobId: string,
  asset: AssetForMockup,
  scenes: MockupScene[],
) {
  const printUrl = asset.processed_url ?? asset.original_url;
  const printBuffer = await downloadImage(printUrl);
  const urls: string[] = [];

  for (const scene of scenes) {
    const backgroundBuffer = await downloadImage(scene.background_url);
    const outputBuffer = await renderScene(scene, backgroundBuffer, printBuffer);
    const outputUrl = await uploadMockupScene(supabase, jobId, asset, scene, outputBuffer);
    urls.push(outputUrl);
  }

  return urls;
}

async function updateJobCounts(
  supabase: SupabaseServiceClient,
  jobId: string,
  totalCount: number,
  successCount: number,
  failedCount: number,
  status: "processing" | "completed" | "failed" | "partial_failed",
) {
  await supabase
    .from("image_jobs")
    .update({
      failed_count: failedCount,
      status,
      success_count: successCount,
      total_count: totalCount,
    })
    .eq("id", jobId);
}

async function markMockupJobFailed(
  supabase: SupabaseServiceClient,
  jobId: string,
  assetCount: number,
  errorMessage: string,
) {
  await supabase
    .from("image_job_items")
    .update({
      error_message: errorMessage,
      status: "failed",
    })
    .eq("job_id", jobId)
    .in("status", ["pending", "processing"]);

  await supabase
    .from("image_jobs")
    .update({
      error_message: errorMessage,
      failed_count: assetCount,
      status: "failed",
      success_count: 0,
      total_count: assetCount,
    })
    .eq("id", jobId);
}

async function createMockupOutput(
  supabase: SupabaseServiceClient,
  assetId: string,
  templateId: string,
  outputImages: string[],
  status: "completed" | "failed",
  errorMessage: string | null,
) {
  const { data, error } = await supabase
    .from("mockup_outputs")
    .insert({
      asset_id: assetId,
      error_message: errorMessage,
      output_images: outputImages,
      status,
      template_id: templateId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`套图结果保存失败：${error.message}`);
  }

  return (data as unknown as { id: string }).id;
}

export async function createAndProcessMockupJob(
  supabase: SupabaseServiceClient,
  assetIds: string[],
  templateId: string,
): Promise<MockupJobResult> {
  const { data: templateData, error: templateError } = await supabase
    .from("mockup_templates")
    .select("id,name,product_type,scenes")
    .eq("id", templateId)
    .single();

  if (templateError) {
    throw new Error(templateError.message);
  }

  const template = templateData as unknown as MockupTemplateForJob;
  const scenes = validateScenes(template.scenes);

  const { data: assetData, error: assetError } = await supabase
    .from("assets")
    .select("id,filename,original_url,processed_url")
    .in("id", assetIds);

  if (assetError) {
    throw new Error(assetError.message);
  }

  const assets = (assetData ?? []) as unknown as AssetForMockup[];

  if (assets.length !== assetIds.length) {
    throw new Error("部分素材不存在，请刷新后重试");
  }

  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .insert({
      failed_count: 0,
      job_type: "mockup",
      options: {
        asset_ids: assetIds,
        scene_count: scenes.length,
        template_id: template.id,
        template_name: template.name,
      },
      status: "pending",
      success_count: 0,
      total_count: assets.length,
    })
    .select("id")
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  const jobId = (jobData as unknown as { id: string }).id;
  const { error: itemCreateError } = await supabase.from("image_job_items").insert(
    assets.map((asset) => ({
      asset_id: asset.id,
      input_url: asset.processed_url ?? asset.original_url,
      job_id: jobId,
      status: "pending",
    })),
  );

  if (itemCreateError) {
    await supabase
      .from("image_jobs")
      .update({
        error_message: itemCreateError.message,
        failed_count: assets.length,
        status: "failed",
      })
      .eq("id", jobId);
    throw new Error(itemCreateError.message);
  }

  const { data: itemData, error: itemFetchError } = await supabase
    .from("image_job_items")
    .select("id,asset_id,input_url")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (itemFetchError) {
    await markMockupJobFailed(supabase, jobId, assets.length, itemFetchError.message);
    throw new Error(itemFetchError.message);
  }

  const items = (itemData ?? []) as unknown as ImageJobItemForMockup[];
  const itemByAssetId = new Map(items.map((item) => [item.asset_id, item]));
  const outputs: MockupOutputResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  await updateJobCounts(supabase, jobId, assets.length, 0, 0, "processing");

  for (const asset of assets) {
    const item = itemByAssetId.get(asset.id);

    if (!item) {
      failedCount += 1;
      outputs.push({
        asset_id: asset.id,
        error_message: "子任务记录不存在",
        filename: asset.filename,
        item_id: "",
        mockup_output_id: null,
        output_images: [],
        status: "failed",
      });
      await updateJobCounts(supabase, jobId, assets.length, successCount, failedCount, "processing");
      continue;
    }

    try {
      await supabase
        .from("image_job_items")
        .update({ error_message: null, status: "processing" })
        .eq("id", item.id);

      const outputImages = await renderMockupImagesForAsset(supabase, jobId, asset, scenes);
      const mockupOutputId = await createMockupOutput(
        supabase,
        asset.id,
        template.id,
        outputImages,
        "completed",
        null,
      );

      await supabase
        .from("image_job_items")
        .update({
          error_message: null,
          output_url: outputImages[0] ?? null,
          status: "completed",
        })
        .eq("id", item.id);

      successCount += 1;
      outputs.push({
        asset_id: asset.id,
        error_message: null,
        filename: asset.filename,
        item_id: item.id,
        mockup_output_id: mockupOutputId,
        output_images: outputImages,
        status: "completed",
      });
    } catch (error) {
      failedCount += 1;
      const errorMessage = getErrorMessage(error);
      let mockupOutputId: string | null = null;

      try {
        mockupOutputId = await createMockupOutput(
          supabase,
          asset.id,
          template.id,
          [],
          "failed",
          errorMessage,
        );
      } catch {
        mockupOutputId = null;
      }

      await supabase
        .from("image_job_items")
        .update({
          error_message: errorMessage,
          status: "failed",
        })
        .eq("id", item.id);

      outputs.push({
        asset_id: asset.id,
        error_message: errorMessage,
        filename: asset.filename,
        item_id: item.id,
        mockup_output_id: mockupOutputId,
        output_images: [],
        status: "failed",
      });
    }

    await updateJobCounts(supabase, jobId, assets.length, successCount, failedCount, "processing");
  }

  const status =
    failedCount === 0 ? "completed" : successCount === 0 ? "failed" : "partial_failed";

  await updateJobCounts(supabase, jobId, assets.length, successCount, failedCount, status);

  return {
    failed_count: failedCount,
    id: jobId,
    outputs,
    status,
    success_count: successCount,
    total_count: assets.length,
  };
}
