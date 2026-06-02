import sharp from "sharp";
import {
  applyTransparentBackgroundToRgba,
  type TransparentBackgroundOptions,
} from "@/lib/image-processing/transparent-background-core";

export async function makeBackgroundTransparent(
  inputBuffer: Buffer,
  options: TransparentBackgroundOptions = {},
): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  applyTransparentBackgroundToRgba(pixels, info.width, info.height, options);

  return sharp(pixels, {
    raw: {
      channels: 4,
      height: info.height,
      width: info.width,
    },
  })
    .png()
    .toBuffer();
}
