import { downloadImageBuffer } from "@/lib/image-ai/image-buffer";
import type { CutoutImageInput, CutoutImageResult } from "@/lib/image-ai/types";

const REMBG_API_URL = process.env.REMBG_API_URL || "http://localhost:7861";
const REMBG_API_SECRET = process.env.REMBG_API_SECRET || "";

function getAuthHeaders(): Record<string, string> {
  if (!REMBG_API_SECRET) return {};
  return { Authorization: `Bearer ${REMBG_API_SECRET}` };
}

export async function cutoutImage(input: CutoutImageInput): Promise<CutoutImageResult> {
  const imageBuffer = await downloadImageBuffer(input.imageUrl);

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "input.png");
  formData.append("model", "isnet-general-use");

  const response = await fetch(`${REMBG_API_URL}/api/remove`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`rembg 抠图失败 (HTTP ${response.status}): ${text || "服务不可用，请确认 rembg 服务已启动"}`);
  }

  const cutoutPng = Buffer.from(await response.arrayBuffer());

  const sharp = (await import("sharp")).default;
  const metadata = await sharp(cutoutPng).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const previewJpg = await sharp(cutoutPng)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 85 })
    .toBuffer();

  const maskPng = await sharp(cutoutPng)
    .extractChannel(3)
    .toColourspace("b-w")
    .png()
    .toBuffer();

  return {
    bbox: { x: 0, y: 0, width, height },
    cutoutPng,
    height,
    maskPng,
    metrics: {
      model: "isnet-general-use",
      mode: input.mode,
      source: "rembg",
    },
    previewJpg,
    width,
  };
}
