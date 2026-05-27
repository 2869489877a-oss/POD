import type { ConnectedComponent, ProcessingBBox } from "@/lib/image-ai/types";

type LabelResult = {
  components: ConnectedComponent[];
  labels: Int32Array;
};

function labelConnectedComponents(mask: Uint8Array, width: number, height: number): LabelResult {
  const labels = new Int32Array(mask.length);
  const components: ConnectedComponent[] = [];
  const stack = new Int32Array(mask.length);
  let nextId = 1;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || labels[start] !== 0) {
      continue;
    }

    let stackLength = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    stack[stackLength] = start;
    stackLength += 1;
    labels[start] = nextId;

    while (stackLength > 0) {
      stackLength -= 1;
      const index = stack[stackLength];
      const x = index % width;
      const y = Math.floor(index / width);

      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) {
            continue;
          }

          const nextX = x + offsetX;
          const nextY = y + offsetY;

          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }

          const nextIndex = nextY * width + nextX;

          if (mask[nextIndex] === 0 || labels[nextIndex] !== 0) {
            continue;
          }

          labels[nextIndex] = nextId;
          stack[stackLength] = nextIndex;
          stackLength += 1;
        }
      }
    }

    components.push({
      area,
      bbox: {
        height: maxY - minY + 1,
        width: maxX - minX + 1,
        x: minX,
        y: minY,
      },
      id: nextId,
    });

    nextId += 1;
  }

  return { components, labels };
}

export function findConnectedComponents(mask: Uint8Array, width: number, height: number): ConnectedComponent[] {
  return labelConnectedComponents(mask, width, height).components;
}

export function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minArea: number,
): Uint8Array {
  const { components, labels } = labelConnectedComponents(mask, width, height);
  const removableIds = new Set(components.filter((component) => component.area < minArea).map((component) => component.id));
  const output = new Uint8Array(mask);

  if (removableIds.size === 0) {
    return output;
  }

  for (let index = 0; index < output.length; index += 1) {
    if (removableIds.has(labels[index])) {
      output[index] = 0;
    }
  }

  return output;
}

export function getMaskBBox(mask: Uint8Array, width: number, height: number, padding = 0): ProcessingBBox {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) {
      continue;
    }

    const x = index % width;
    const y = Math.floor(index / width);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (maxX < minX || maxY < minY) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width - 1, maxX + padding);
  const bottom = Math.min(height - 1, maxY + padding);

  return {
    height: bottom - y + 1,
    width: right - x + 1,
    x,
    y,
  };
}

export function keepLargestComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  maxComponents: number,
): Uint8Array {
  const { components, labels } = labelConnectedComponents(mask, width, height);
  const keepIds = new Set(
    components
      .sort((a, b) => b.area - a.area)
      .slice(0, maxComponents)
      .map((component) => component.id),
  );
  const output = new Uint8Array(mask.length);

  for (let index = 0; index < mask.length; index += 1) {
    output[index] = keepIds.has(labels[index]) ? 255 : 0;
  }

  return output;
}
