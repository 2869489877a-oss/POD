import { downloadImageBuffer } from "@/lib/image-ai/image-buffer";
import type { CutoutImageInput, CutoutImageResult } from "@/lib/image-ai/types";
import { makeBackgroundTransparent } from "@/lib/image-processing/transparent-background";

const REMBG_API_URL = process.env.REMBG_API_URL?.trim() || "";
const REMBG_API_SECRET = process.env.REMBG_API_SECRET || "";
const configuredRembgTimeoutMs = Number(process.env.REMBG_TIMEOUT_MS || 120_000);
const REMBG_TIMEOUT_MS =
  Number.isFinite(configuredRembgTimeoutMs) && configuredRembgTimeoutMs > 0
    ? configuredRembgTimeoutMs
    : 120_000;

function getAuthHeaders(): Record<string, string> {
  if (!REMBG_API_SECRET) return {};
  return { Authorization: `Bearer ${REMBG_API_SECRET}` };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "rembg unavailable";
}

async function removeWithRembg(imageBuffer: Buffer) {
  if (!REMBG_API_URL) {
    throw new Error("rembg disabled");
  }

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "input.png");
  formData.append("model", "isnet-general-use");

  const response = await fetch(`${REMBG_API_URL}/api/remove`, {
    body: formData,
    headers: getAuthHeaders(),
    method: "POST",
    signal: AbortSignal.timeout(REMBG_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`rembg cutout failed (HTTP ${response.status}): ${text || "service unavailable"}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function removeWithLocalFallback(imageBuffer: Buffer, input: CutoutImageInput) {
  const sharp = (await import("sharp")).default;
  const maxSize = input.options?.maxSize ?? 2200;
  const normalizedBuffer = await sharp(imageBuffer)
    .rotate()
    .resize(maxSize, maxSize, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return makeBackgroundTransparent(normalizedBuffer, {
    feather: input.options?.featherRadius ?? 18,
    tolerance: input.options?.tolerance ?? 42,
    transparency: 100,
  });
}

async function buildCutoutResult(
  input: CutoutImageInput,
  cutoutPng: Buffer,
  source: "rembg" | "local-fallback",
  fallbackError?: string,
): Promise<CutoutImageResult> {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(cutoutPng).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const previewJpg = await sharp(cutoutPng)
    .flatten({ background: { b: 255, g: 255, r: 255 } })
    .jpeg({ quality: 85 })
    .toBuffer();

  const maskPng = await sharp(cutoutPng)
    .extractChannel(3)
    .toColourspace("b-w")
    .png()
    .toBuffer();

  return {
    bbox: { height, width, x: 0, y: 0 },
    cutoutPng,
    height,
    maskPng,
    metrics: {
      fallback_error: fallbackError,
      model: source === "rembg" ? "isnet-general-use" : "edge-flood-fill",
      mode: input.mode,
      source,
    },
    previewJpg,
    width,
  };
}

export async function cutoutImage(input: CutoutImageInput): Promise<CutoutImageResult> {
  const imageBuffer = await downloadImageBuffer(input.imageUrl);

  if (REMBG_API_URL) {
    try {
      return await buildCutoutResult(input, await removeWithRembg(imageBuffer), "rembg");
    } catch (error) {
      const fallbackError = getErrorMessage(error);
      const fallbackPng = await removeWithLocalFallback(imageBuffer, input);

      return buildCutoutResult(input, fallbackPng, "local-fallback", fallbackError);
    }
  }

  return buildCutoutResult(input, await removeWithLocalFallback(imageBuffer, input), "local-fallback");
}
