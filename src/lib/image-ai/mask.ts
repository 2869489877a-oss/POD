import type { MaskCombineMode, MaskStats } from "@/lib/image-ai/types";

export function createMask(width: number, height: number, value = 0): Uint8Array {
  return new Uint8Array(width * height).fill(value);
}

export function invertMask(mask: Uint8Array): Uint8Array {
  const output = new Uint8Array(mask.length);

  for (let index = 0; index < mask.length; index += 1) {
    output[index] = mask[index] > 0 ? 0 : 255;
  }

  return output;
}

export function maskStats(mask: Uint8Array): MaskStats {
  let nonZero = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] > 0) {
      nonZero += 1;
    }
  }

  const total = mask.length;

  return {
    nonZero,
    ratio: total === 0 ? 0 : nonZero / total,
    total,
    zero: total - nonZero,
  };
}

export function combineMasks(maskA: Uint8Array, maskB: Uint8Array, mode: MaskCombineMode): Uint8Array {
  if (maskA.length !== maskB.length) {
    throw new Error("Mask 合并失败：尺寸不一致");
  }

  const output = new Uint8Array(maskA.length);

  for (let index = 0; index < maskA.length; index += 1) {
    const a = maskA[index] > 0;
    const b = maskB[index] > 0;

    if (mode === "and") {
      output[index] = a && b ? 255 : 0;
    } else if (mode === "or") {
      output[index] = a || b ? 255 : 0;
    } else if (mode === "xor") {
      output[index] = a !== b ? 255 : 0;
    } else {
      output[index] = a && !b ? 255 : 0;
    }
  }

  return output;
}

export function applyAlphaMask(data: Buffer, width: number, height: number, mask: Uint8Array): Buffer {
  if (mask.length !== width * height) {
    throw new Error("应用 Mask 失败：尺寸不一致");
  }

  const output = Buffer.from(data);

  for (let pixelIndex = 0; pixelIndex < mask.length; pixelIndex += 1) {
    const alphaIndex = pixelIndex * 4 + 3;
    const originalAlpha = output[alphaIndex] ?? 255;

    output[alphaIndex] = Math.round((originalAlpha * mask[pixelIndex]) / 255);
  }

  return output;
}
