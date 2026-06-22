import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import type { MockupScene } from "@/lib/mockups/scenes";
import { readImageBuffer } from "@/lib/network/image-buffer";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type MockupPreviewResult = {
  error?: string;
  name: string;
  success: boolean;
  url?: string;
};

async function downloadImage(url: string) {
  return readImageBuffer(url, {
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 30_000,
  });
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

      const savedPreview = await saveLocalAssetAtPath({
        buffer: outputBuffer,
        relativePath: outputPath,
      });

      results.push({
        name: scene.name,
        success: true,
        url: savedPreview.publicUrl,
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
