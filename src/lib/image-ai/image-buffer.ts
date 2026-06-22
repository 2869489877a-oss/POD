import sharp from "sharp";

import type { LoadedImagePixels } from "@/lib/image-ai/types";
import { readImageBuffer } from "@/lib/network/image-buffer";

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export async function downloadImageBuffer(url: string): Promise<Buffer> {
  try {
    return await readImageBuffer(url, {
      maxBytes: MAX_DOWNLOAD_BYTES,
      timeoutMs: 30_000,
    });
  } catch (error) {
    throw new Error(`图片下载失败：${error instanceof Error ? error.message : "未知错误"}，URL: ${url}`);
  }
}

export async function loadImagePixels(buffer: Buffer): Promise<LoadedImagePixels> {
  const { data, info } = await sharp(buffer).rotate().ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });

  return {
    channels: 4,
    data: Buffer.from(data),
    height: info.height,
    width: info.width,
  };
}

export async function normalizeImage(buffer: Buffer, maxSize = 1800): Promise<Buffer> {
  const image = sharp(buffer).rotate().ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width <= 0 || height <= 0) {
    throw new Error("图片规范化失败：无法读取图片尺寸");
  }

  const longestSide = Math.max(width, height);

  if (longestSide <= maxSize) {
    return image.png().toBuffer();
  }

  return image
    .resize({
      fit: "inside",
      height: maxSize,
      width: maxSize,
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
