import { downloadImageBuffer } from "@/lib/image-ai/image-buffer";
import type { PrintExtractionResult } from "@/lib/image-ai/types";

const REMBG_API_URL = process.env.REMBG_API_URL || "http://localhost:7861";
const REMBG_API_SECRET = process.env.REMBG_API_SECRET || "";

function getAuthHeaders(): Record<string, string> {
  if (!REMBG_API_SECRET) return {};
  return { Authorization: `Bearer ${REMBG_API_SECRET}` };
}

export async function extractPrintViaLocalWorker(
  imageUrl: string,
  options: { tolerance?: number; sharpen?: boolean; denoise?: boolean; correctPerspective?: boolean; model?: string } = {},
): Promise<PrintExtractionResult> {
  const imageBuffer = await downloadImageBuffer(imageUrl);

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "input.png");
  formData.append("model", options.model || "isnet-general-use");
  formData.append("options", JSON.stringify({
    tolerance: options.tolerance ?? 60,
    sharpen: options.sharpen ?? true,
    denoise: options.denoise ?? true,
    correct_perspective: options.correctPerspective ?? true,
  }));

  const response = await fetch(`${REMBG_API_URL}/api/extract-print`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`印花提取失败 (HTTP ${response.status}): ${text || "本地服务不可用"}`);
  }

  const metricsHeader = response.headers.get("X-Metrics");
  let metrics: Record<string, unknown> = {};
  try {
    if (metricsHeader) metrics = JSON.parse(metricsHeader);
  } catch { /* ignore */ }

  const resultPng = Buffer.from(await response.arrayBuffer());

  const sharp = (await import("sharp")).default;
  const meta = await sharp(resultPng).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const previewJpg = await sharp(resultPng)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 85 })
    .toBuffer();

  const maskPng = await sharp(resultPng)
    .extractChannel(3)
    .toColourspace("b-w")
    .png()
    .toBuffer();

  return {
    bbox: { x: 0, y: 0, width, height },
    finalPng: resultPng,
    height,
    maskPng,
    metrics: {
      ...metrics,
      source: "local_worker_7step",
    },
    previewJpg,
    rawPng: resultPng,
    width,
  };
}
