import sharp from "sharp";

import type { LoadedImagePixels } from "@/lib/image-ai/types";

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export async function downloadImageBuffer(url: string): Promise<Buffer> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`图片下载失败：URL 无效，URL: ${url}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`图片下载失败：只允许 http/https URL，URL: ${url}`);
  }

  const response = await fetch(parsedUrl);

  if (!response.ok) {
    throw new Error(`图片下载失败：HTTP ${response.status}，URL: ${url}`);
  }

  const contentType = response.headers.get("content-type");

  if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`图片下载失败：响应不是图片，Content-Type: ${contentType ?? "unknown"}，URL: ${url}`);
  }

  const contentLength = response.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_DOWNLOAD_BYTES) {
    throw new Error(`图片下载失败：图片超过 25MB，URL: ${url}`);
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`图片下载失败：图片超过 25MB，URL: ${url}`);
    }

    return Buffer.from(arrayBuffer);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let downloadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    downloadedBytes += value.byteLength;

    if (downloadedBytes > MAX_DOWNLOAD_BYTES) {
      throw new Error(`图片下载失败：图片超过 25MB，URL: ${url}`);
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
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
