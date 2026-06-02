export type TransparentBackgroundOptions = {
  feather?: number;
  tolerance?: number;
  transparency?: number;
};

type RgbColor = {
  b: number;
  g: number;
  r: number;
};

type RgbaBuffer = Uint8Array | Uint8ClampedArray;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function colorDistance(data: RgbaBuffer, offset: number, color: RgbColor) {
  const r = (data[offset] ?? 0) - color.r;
  const g = (data[offset + 1] ?? 0) - color.g;
  const b = (data[offset + 2] ?? 0) - color.b;
  return Math.sqrt(r * r + g * g + b * b);
}

function luminance(data: RgbaBuffer, offset: number) {
  return 0.2126 * (data[offset] ?? 0) + 0.7152 * (data[offset + 1] ?? 0) + 0.0722 * (data[offset + 2] ?? 0);
}

function estimateBackgroundColor(data: RgbaBuffer, width: number, height: number): RgbColor {
  const buckets = new Map<string, { b: number; count: number; g: number; r: number }>();
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 180));

  function addSample(x: number, y: number) {
    const offset = (y * width + x) * 4;
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 16) return;

    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { b: 0, count: 0, g: 0, r: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  for (let x = 0; x < width; x += sampleStep) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 0; y < height; y += sampleStep) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  const dominant = Array.from(buckets.values()).sort((a, b) => b.count - a.count)[0];
  if (!dominant) return { b: 255, g: 255, r: 255 };

  return {
    b: Math.round(dominant.b / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    r: Math.round(dominant.r / dominant.count),
  };
}

export function applyTransparentBackgroundToRgba(
  data: RgbaBuffer,
  width: number,
  height: number,
  options: TransparentBackgroundOptions = {},
) {
  const tolerance = clamp(options.tolerance ?? 42, 1, 180);
  const feather = clamp(options.feather ?? 18, 0, 80);
  const transparency = clamp(options.transparency ?? 100, 0, 100);
  const backgroundAlpha = Math.round(255 * (1 - transparency / 100));
  const background = estimateBackgroundColor(data, width, height);
  const backgroundLum = 0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b;
  const backgroundIsLight = backgroundLum > 215;
  const total = width * height;
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  function isBackgroundCandidate(index: number) {
    const offset = index * 4;
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 16) return true;
    if (colorDistance(data, offset, background) <= tolerance) return true;
    return backgroundIsLight && luminance(data, offset) >= 255 - tolerance * 0.35;
  }

  function enqueue(index: number) {
    if (index < 0 || index >= total || mask[index]) return;
    if (!isBackgroundCandidate(index)) return;
    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (mask[index]) {
      data[offset + 3] = Math.min(data[offset + 3] ?? 255, backgroundAlpha);
      continue;
    }

    if (feather <= 0) continue;

    const distance = colorDistance(data, offset, background);
    if (distance > tolerance + feather) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    let touchesBackground = false;
    for (let dy = -1; dy <= 1 && !touchesBackground; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (mask[ny * width + nx]) {
          touchesBackground = true;
          break;
        }
      }
    }

    if (!touchesBackground) continue;

    const keepRatio = clamp((distance - tolerance) / feather, 0, 1);
    const currentAlpha = data[offset + 3] ?? 255;
    data[offset + 3] = Math.round(backgroundAlpha * (1 - keepRatio) + currentAlpha * keepRatio);
  }
}
