import { colorDistance, estimateEdgeBackgroundColor } from "@/lib/image-ai/color";
import { getMaskBBox, keepLargestComponents, removeSmallComponents } from "@/lib/image-ai/components";
import { cropBufferByBBox } from "@/lib/image-ai/crop";
import { downloadImageBuffer, loadImagePixels, normalizeImage } from "@/lib/image-ai/image-buffer";
import { applyAlphaMask, invertMask, maskStats } from "@/lib/image-ai/mask";
import { closeMask, featherMask } from "@/lib/image-ai/morphology";
import { makeMaskPng, makeWhitePreview, rgbaToPng } from "@/lib/image-ai/output";
import type { CutoutImageInput, CutoutImageResult, CutoutMode, ProcessingBBox, RgbColor } from "@/lib/image-ai/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pixelColor(data: Buffer, pixelIndex: number): RgbColor {
  const index = pixelIndex * 4;

  return {
    b: data[index + 2] ?? 0,
    g: data[index + 1] ?? 0,
    r: data[index] ?? 0,
  };
}

function pixelMatchesBackground(data: Buffer, pixelIndex: number, backgroundColor: RgbColor, tolerance: number): boolean {
  const alpha = data[pixelIndex * 4 + 3] ?? 255;

  if (alpha < 16) {
    return true;
  }

  return colorDistance(pixelColor(data, pixelIndex), backgroundColor) <= tolerance;
}

function getBackgroundColor(mode: CutoutMode, data: Buffer, width: number, height: number): RgbColor {
  if (mode === "white_background") {
    return { b: 255, g: 255, r: 255 };
  }

  if (mode === "black_background") {
    return { b: 0, g: 0, r: 0 };
  }

  return estimateEdgeBackgroundColor(data, width, height);
}

function createEdgeFloodBackgroundMask(
  data: Buffer,
  width: number,
  height: number,
  backgroundColor: RgbColor,
  tolerance: number,
): Uint8Array {
  const backgroundMask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let readIndex = 0;
  let writeIndex = 0;

  function addSeed(pixelIndex: number) {
    if (backgroundMask[pixelIndex] > 0) {
      return;
    }

    if (!pixelMatchesBackground(data, pixelIndex, backgroundColor, tolerance)) {
      return;
    }

    backgroundMask[pixelIndex] = 255;
    queue[writeIndex] = pixelIndex;
    writeIndex += 1;
  }

  for (let x = 0; x < width; x += 1) {
    addSeed(x);
    addSeed((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    addSeed(y * width);
    addSeed(y * width + width - 1);
  }

  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex];
    readIndex += 1;

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const neighbors = [pixelIndex - 1, pixelIndex + 1, pixelIndex - width, pixelIndex + width];

    for (const nextIndex of neighbors) {
      if (nextIndex < 0 || nextIndex >= backgroundMask.length || backgroundMask[nextIndex] > 0) {
        continue;
      }

      const nextX = nextIndex % width;
      const nextY = Math.floor(nextIndex / width);

      if (Math.abs(nextX - x) + Math.abs(nextY - y) !== 1) {
        continue;
      }

      if (!pixelMatchesBackground(data, nextIndex, backgroundColor, tolerance)) {
        continue;
      }

      backgroundMask[nextIndex] = 255;
      queue[writeIndex] = nextIndex;
      writeIndex += 1;
    }
  }

  return backgroundMask;
}

function validateCutoutMask(mask: Uint8Array, width: number, height: number, bbox: ProcessingBBox) {
  const stats = maskStats(mask);

  if (stats.ratio < 0.002) {
    throw new Error("抠图失败：检测到的主体区域过小");
  }

  if (stats.ratio > 0.95) {
    throw new Error("抠图失败：检测到的主体区域过大，背景识别不可靠");
  }

  if (bbox.width <= 0 || bbox.height <= 0 || bbox.width > width || bbox.height > height) {
    throw new Error("抠图失败：主体边界框无效");
  }

  return stats;
}

export async function cutoutImage(input: CutoutImageInput): Promise<CutoutImageResult> {
  const maxSize = input.options?.maxSize ?? 1800;
  const tolerance = input.options?.tolerance ?? 42;
  const featherRadius = input.options?.featherRadius ?? 1;
  const padding = input.options?.padding ?? 8;
  const cropToContent = input.options?.cropToContent ?? true;

  const originalBuffer = await downloadImageBuffer(input.imageUrl);
  const normalizedBuffer = await normalizeImage(originalBuffer, maxSize);
  const { data, height, width } = await loadImagePixels(normalizedBuffer);
  const backgroundColor = getBackgroundColor(input.mode, data, width, height);
  const effectiveTolerance = input.mode === "auto_background" ? Math.max(tolerance, 46) : tolerance;
  const backgroundMask = createEdgeFloodBackgroundMask(data, width, height, backgroundColor, effectiveTolerance);
  let keepMask = invertMask(backgroundMask);
  const minArea = Math.max(32, Math.floor(width * height * 0.00008));

  keepMask = removeSmallComponents(keepMask, width, height, minArea);
  keepMask = keepLargestComponents(keepMask, width, height, 8);
  keepMask = closeMask(keepMask, width, height, 1);

  const bbox = getMaskBBox(keepMask, width, height, padding);
  const stats = validateCutoutMask(keepMask, width, height, bbox);
  const outputMask = featherRadius > 0 ? featherMask(keepMask, width, height, featherRadius) : keepMask;
  const cutoutData = applyAlphaMask(data, width, height, outputMask);
  let cutoutPng = await rgbaToPng(cutoutData, width, height);
  let maskPng = await makeMaskPng(outputMask, width, height);
  let outputWidth = width;
  let outputHeight = height;

  if (cropToContent) {
    cutoutPng = await cropBufferByBBox(cutoutPng, bbox);
    maskPng = await cropBufferByBBox(maskPng, bbox);
    outputWidth = bbox.width;
    outputHeight = bbox.height;
  }

  const previewJpg = await makeWhitePreview(cutoutPng);
  const bboxAreaRatio = (bbox.width * bbox.height) / (width * height);
  const confidence = clamp(1 - Math.abs(stats.ratio - 0.35) - (bboxAreaRatio > 0.9 ? 0.25 : 0), 0, 1);

  return {
    bbox,
    cutoutPng,
    height: outputHeight,
    maskPng,
    metrics: {
      backgroundColor,
      bboxAreaRatio,
      confidence,
      maskAreaRatio: stats.ratio,
      mode: input.mode,
      tolerance: effectiveTolerance,
    },
    previewJpg,
    width: outputWidth,
  };
}
