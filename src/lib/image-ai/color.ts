import type { HsvColor, RgbColor } from "@/lib/image-ai/types";

type EdgeColorBucket = {
  color: RgbColor;
  count: number;
};

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const normalizedR = r / 255;
  const normalizedG = g / 255;
  const normalizedB = b / 255;
  const max = Math.max(normalizedR, normalizedG, normalizedB);
  const min = Math.min(normalizedR, normalizedG, normalizedB);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === normalizedR) {
      h = 60 * (((normalizedG - normalizedB) / delta) % 6);
    } else if (max === normalizedG) {
      h = 60 * ((normalizedB - normalizedR) / delta + 2);
    } else {
      h = 60 * ((normalizedR - normalizedG) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getSaturation(r: number, g: number, b: number): number {
  return rgbToHsv(r, g, b).s;
}

export function colorDistance(a: RgbColor, b: RgbColor): number {
  const r = a.r - b.r;
  const g = a.g - b.g;
  const blue = a.b - b.b;

  return Math.sqrt(r * r + g * g + blue * blue);
}

export function estimateEdgeBackgroundColor(data: Buffer, width: number, height: number): RgbColor {
  const colors = estimateDominantEdgeColors(data, width, height);

  return colors[0]?.color ?? { b: 255, g: 255, r: 255 };
}

export function estimateDominantEdgeColors(data: Buffer, width: number, height: number): EdgeColorBucket[] {
  const buckets = new Map<string, { b: number; count: number; g: number; r: number }>();
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 160));

  function addSample(x: number, y: number) {
    const index = (y * width + x) * 4;
    const alpha = data[index + 3] ?? 255;

    if (alpha < 16) {
      return;
    }

    const r = data[index] ?? 0;
    const g = data[index + 1] ?? 0;
    const b = data[index + 2] ?? 0;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const current = buckets.get(key) ?? { b: 0, count: 0, g: 0, r: 0 };

    current.count += 1;
    current.r += r;
    current.g += g;
    current.b += b;
    buckets.set(key, current);
  }

  for (let x = 0; x < width; x += sampleStep) {
    addSample(x, 0);
    addSample(x, height - 1);
  }

  for (let y = 0; y < height; y += sampleStep) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  return Array.from(buckets.values())
    .map((bucket) => ({
      color: {
        b: Math.round(bucket.b / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        r: Math.round(bucket.r / bucket.count),
      },
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}
