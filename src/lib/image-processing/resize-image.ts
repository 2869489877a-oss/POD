import sharp from "sharp";

import type { ResizePreset } from "@/lib/image-processing/resize-presets";

export async function resizeImageBuffer(inputBuffer: Buffer, preset: ResizePreset) {
  const image = sharp(inputBuffer)
    .rotate()
    .resize(preset.width, preset.height, {
      background:
        preset.background === "transparent"
          ? { alpha: 0, b: 0, g: 0, r: 0 }
          : { alpha: 1, b: 255, g: 255, r: 255 },
      fit: "contain",
      position: "center",
      withoutEnlargement: false,
    });

  if (preset.format === "png") {
    return image.png().toBuffer();
  }

  return image.flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
}
