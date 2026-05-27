import sharp from "sharp";

import type { ProcessingBBox } from "@/lib/image-ai/types";

export function safeBBox(bbox: ProcessingBBox, width: number, height: number): ProcessingBBox {
  const x = Math.max(0, Math.min(width - 1, Math.floor(bbox.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(bbox.y)));
  const right = Math.max(x, Math.min(width, Math.ceil(bbox.x + bbox.width)));
  const bottom = Math.max(y, Math.min(height, Math.ceil(bbox.y + bbox.height)));

  return {
    height: Math.max(0, bottom - y),
    width: Math.max(0, right - x),
    x,
    y,
  };
}

export async function cropBufferByBBox(buffer: Buffer, bbox: ProcessingBBox): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const safe = safeBBox(bbox, width, height);

  if (safe.width <= 0 || safe.height <= 0) {
    throw new Error("图片裁剪失败：无效裁剪区域");
  }

  return sharp(buffer)
    .extract({
      height: safe.height,
      left: safe.x,
      top: safe.y,
      width: safe.width,
    })
    .toBuffer();
}

export function expandBBox(bbox: ProcessingBBox, width: number, height: number, padding: number): ProcessingBBox {
  return safeBBox(
    {
      height: bbox.height + padding * 2,
      width: bbox.width + padding * 2,
      x: bbox.x - padding,
      y: bbox.y - padding,
    },
    width,
    height,
  );
}
