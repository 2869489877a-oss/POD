import { colorDistance, estimateEdgeBackgroundColor, getLuminance, getSaturation } from "@/lib/image-ai/color";
import { getMaskBBox, keepLargestComponents, removeSmallComponents } from "@/lib/image-ai/components";
import { cropBufferByBBox, safeBBox } from "@/lib/image-ai/crop";
import { downloadImageBuffer, loadImagePixels, normalizeImage } from "@/lib/image-ai/image-buffer";
import { applyAlphaMask, maskStats } from "@/lib/image-ai/mask";
import { closeMask, featherMask } from "@/lib/image-ai/morphology";
import { makeMaskPng, makeWhitePreview, rgbaToPng } from "@/lib/image-ai/output";
import type {
  PrintExtractionInput,
  PrintExtractionMode,
  PrintExtractionResult,
  ProcessingBBox,
  RgbColor,
} from "@/lib/image-ai/types";

type StrategyResult = {
  backgroundColor: RgbColor;
  confidence: number;
  mask: Uint8Array;
  maskAreaRatio: number;
  mode: PrintExtractionMode;
  selectedStrategy: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPixel(data: Buffer, pixelIndex: number): RgbColor {
  const index = pixelIndex * 4;

  return {
    b: data[index + 2] ?? 0,
    g: data[index + 1] ?? 0,
    r: data[index] ?? 0,
  };
}

function isInsideRegion(x: number, y: number, region: ProcessingBBox | null): boolean {
  if (!region) {
    return true;
  }

  return x >= region.x && y >= region.y && x < region.x + region.width && y < region.y + region.height;
}

function createManualRectMask(data: Buffer, width: number, height: number, region: ProcessingBBox): Uint8Array {
  const mask = new Uint8Array(width * height);

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const pixelIndex = y * width + x;
      const alpha = data[pixelIndex * 4 + 3] ?? 255;

      mask[pixelIndex] = alpha > 16 ? 255 : 0;
    }
  }

  return mask;
}

function createStrategyMask(
  data: Buffer,
  width: number,
  height: number,
  mode: Exclude<PrintExtractionMode, "auto" | "manual_rect">,
  backgroundColor: RgbColor,
  region: ProcessingBBox | null,
  preserveWhiteInk: boolean,
  preserveBlackInk: boolean,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const backgroundLuminance = getLuminance(backgroundColor.r, backgroundColor.g, backgroundColor.b);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isInsideRegion(x, y, region)) {
        continue;
      }

      const pixelIndex = y * width + x;
      const alpha = data[pixelIndex * 4 + 3] ?? 255;

      if (alpha < 16) {
        continue;
      }

      const color = getPixel(data, pixelIndex);
      const luminance = getLuminance(color.r, color.g, color.b);
      const saturation = getSaturation(color.r, color.g, color.b);
      const distance = colorDistance(color, backgroundColor);
      const luminanceDelta = Math.abs(luminance - backgroundLuminance);
      let keep = false;

      if (mode === "light_garment") {
        keep =
          (luminance < 178 && distance > 28) ||
          (saturation > 0.22 && distance > 34) ||
          (preserveBlackInk && luminance < 88) ||
          (preserveWhiteInk && luminance > 230 && distance > 46);
      } else if (mode === "dark_garment") {
        keep =
          (luminance > 108 && distance > 34) ||
          (saturation > 0.24 && distance > 40) ||
          (preserveWhiteInk && luminance > 220) ||
          (preserveBlackInk && luminance < 60 && distance > 55);
      } else {
        keep = distance > 54 && (saturation > 0.1 || luminanceDelta > 44);
      }

      mask[pixelIndex] = keep ? 255 : 0;
    }
  }

  return mask;
}

function evaluateStrategy(
  data: Buffer,
  width: number,
  height: number,
  mode: PrintExtractionMode,
  region: ProcessingBBox | null,
  preserveWhiteInk: boolean,
  preserveBlackInk: boolean,
): StrategyResult {
  const backgroundColor = estimateEdgeBackgroundColor(data, width, height);
  const strategyMode: Exclude<PrintExtractionMode, "auto" | "manual_rect"> =
    mode === "light_garment" || mode === "dark_garment" ? mode : "high_contrast";
  const mask =
    mode === "manual_rect" && region
      ? createManualRectMask(data, width, height, region)
      : createStrategyMask(
          data,
          width,
          height,
          strategyMode,
          backgroundColor,
          region,
          preserveWhiteInk,
          preserveBlackInk,
        );
  const stats = maskStats(mask);
  const bbox = getMaskBBox(mask, width, height, 0);
  const bboxAreaRatio = bbox.width > 0 && bbox.height > 0 ? (bbox.width * bbox.height) / (width * height) : 1;
  const areaScore = stats.ratio >= 0.002 && stats.ratio <= 0.85 ? 1 : 0;
  const bboxScore = bboxAreaRatio > 0 && bboxAreaRatio < 0.9 ? 1 : 0.35;
  const densityScore = bboxAreaRatio > 0 ? clamp(stats.ratio / bboxAreaRatio, 0, 1) : 0;
  const confidence = clamp(areaScore * 0.5 + bboxScore * 0.25 + densityScore * 0.25, 0, 1);

  return {
    backgroundColor,
    confidence,
    mask,
    maskAreaRatio: stats.ratio,
    mode,
    selectedStrategy: mode,
  };
}

function selectAutoStrategy(
  data: Buffer,
  width: number,
  height: number,
  region: ProcessingBBox | null,
  preserveWhiteInk: boolean,
  preserveBlackInk: boolean,
): StrategyResult {
  const strategies: Array<Exclude<PrintExtractionMode, "auto" | "manual_rect">> = [
    "light_garment",
    "dark_garment",
    "high_contrast",
  ];
  const results = strategies.map((strategy) =>
    evaluateStrategy(data, width, height, strategy, region, preserveWhiteInk, preserveBlackInk),
  );

  return results.sort((a, b) => b.confidence - a.confidence)[0];
}

function validatePrintMask(mask: Uint8Array, width: number, height: number, bbox: ProcessingBBox) {
  const stats = maskStats(mask);

  if (stats.ratio < 0.002) {
    throw new Error("印花提取失败：未检测到有效印花区域");
  }

  if (stats.ratio > 0.85) {
    throw new Error("印花提取失败：检测到的印花区域过大，请尝试手动框选或调整模式");
  }

  if (bbox.width <= 0 || bbox.height <= 0 || bbox.width > width || bbox.height > height) {
    throw new Error("印花提取失败：印花边界框无效");
  }

  return stats;
}

export async function extractPrintFromImage(input: PrintExtractionInput): Promise<PrintExtractionResult> {
  const maxSize = input.options?.maxSize ?? 1800;
  const padding = input.options?.padding ?? 8;
  const minComponentArea = input.options?.minComponentArea;
  const featherRadius = input.options?.featherRadius ?? 1;
  const preserveWhiteInk = input.options?.preserveWhiteInk ?? true;
  const preserveBlackInk = input.options?.preserveBlackInk ?? true;

  const originalBuffer = await downloadImageBuffer(input.imageUrl);
  const normalizedBuffer = await normalizeImage(originalBuffer, maxSize);
  const { data, height, width } = await loadImagePixels(normalizedBuffer);
  const manualRegion = input.manualRect ? safeBBox(input.manualRect, width, height) : null;

  if (input.mode === "manual_rect" && (!manualRegion || manualRegion.width <= 0 || manualRegion.height <= 0)) {
    throw new Error("印花提取失败：手动框选区域无效");
  }

  const rawResult =
    input.mode === "auto"
      ? selectAutoStrategy(data, width, height, manualRegion, preserveWhiteInk, preserveBlackInk)
      : evaluateStrategy(data, width, height, input.mode, manualRegion, preserveWhiteInk, preserveBlackInk);
  const rawMask = rawResult.mask;
  const componentMinArea = minComponentArea ?? Math.max(24, Math.floor(width * height * 0.00005));
  let finalMask = removeSmallComponents(rawMask, width, height, componentMinArea);

  finalMask = keepLargestComponents(finalMask, width, height, 12);
  finalMask = closeMask(finalMask, width, height, 1);

  const bbox = getMaskBBox(finalMask, width, height, padding);
  const stats = validatePrintMask(finalMask, width, height, bbox);
  const outputMask = featherRadius > 0 ? featherMask(finalMask, width, height, featherRadius) : finalMask;
  const rawData = applyAlphaMask(data, width, height, rawMask);
  const finalData = applyAlphaMask(data, width, height, outputMask);
  let rawPng = await rgbaToPng(rawData, width, height);
  let finalPng = await rgbaToPng(finalData, width, height);
  let maskPng = await makeMaskPng(outputMask, width, height);

  rawPng = await cropBufferByBBox(rawPng, bbox);
  finalPng = await cropBufferByBBox(finalPng, bbox);
  maskPng = await cropBufferByBBox(maskPng, bbox);

  const previewJpg = await makeWhitePreview(finalPng);
  const bboxAreaRatio = (bbox.width * bbox.height) / (width * height);
  const confidence = clamp(rawResult.confidence - (stats.ratio > 0.65 ? 0.15 : 0), 0, 1);

  return {
    bbox,
    finalPng,
    height: bbox.height,
    maskPng,
    metrics: {
      backgroundColor: rawResult.backgroundColor,
      bboxAreaRatio,
      confidence,
      maskAreaRatio: stats.ratio,
      mode: input.mode,
      rawMaskAreaRatio: rawResult.maskAreaRatio,
      selectedStrategy: input.mode === "auto" ? rawResult.selectedStrategy : input.mode,
    },
    previewJpg,
    rawPng,
    width: bbox.width,
  };
}
