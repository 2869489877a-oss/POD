import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import type { MockupScene } from "@/lib/mockups/scenes";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ASSETS_BUCKET = "assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type MockupPreviewResult = {
  error?: string;
  name: string;
  success: boolean;
  url?: string;
};

async function downloadImage(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function safeName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]/g, "-") || "scene";
}

export async function renderMockupPreviews(
  supabase: SupabaseServiceClient,
  templateId: string,
  scenes: MockupScene[],
  printBuffer: Buffer,
) {
  const results: MockupPreviewResult[] = [];
  const datePath = new Date().toISOString().slice(0, 10);

  for (const scene of scenes) {
    try {
      const backgroundBuffer = await downloadImage(scene.background_url);
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

      const outputBuffer = await image.png().toBuffer();
      const outputPath = `mockup-previews/${datePath}/${templateId}/${randomUUID()}-${safeName(
        scene.name,
      )}.png`;

      const { error: uploadError } = await supabase.storage
        .from(ASSETS_BUCKET)
        .upload(outputPath, outputBuffer, {
          contentType: "image/png",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`预览图上传失败：${uploadError.message}`);
      }

      const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(outputPath);

      results.push({
        name: scene.name,
        success: true,
        url: data.publicUrl,
      });
    } catch (error) {
      results.push({
        error: getErrorMessage(error),
        name: scene.name,
        success: false,
      });
    }
  }

  return results;
}
