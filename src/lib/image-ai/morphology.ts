export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }

  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;

      for (let offsetY = -radius; offsetY <= radius && value === 0; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;

          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }

          if (mask[nextY * width + nextX] > 0) {
            value = 255;
            break;
          }
        }
      }

      output[y * width + x] = value;
    }
  }

  return output;
}

export function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }

  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 255;

      for (let offsetY = -radius; offsetY <= radius && value === 255; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;

          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            value = 0;
            break;
          }

          if (mask[nextY * width + nextX] === 0) {
            value = 0;
            break;
          }
        }
      }

      output[y * width + x] = value;
    }
  }

  return output;
}

export function openMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return dilateMask(erodeMask(mask, width, height, radius), width, height, radius);
}

export function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return erodeMask(dilateMask(mask, width, height, radius), width, height, radius);
}

export function featherMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }

  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  const diameter = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const nextX = x + offsetX;

        if (nextX < 0 || nextX >= width) {
          continue;
        }

        sum += mask[y * width + nextX];
        count += 1;
      }

      horizontal[y * width + x] = Math.round(sum / Math.min(count, diameter));
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;

      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const nextY = y + offsetY;

        if (nextY < 0 || nextY >= height) {
          continue;
        }

        sum += horizontal[nextY * width + x];
        count += 1;
      }

      output[y * width + x] = Math.round(sum / Math.min(count, diameter));
    }
  }

  return output;
}
