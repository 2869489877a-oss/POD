import sharp from "sharp";

export async function rgbaToPng(data: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(data, {
    raw: {
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

export async function makeWhitePreview(pngWithAlpha: Buffer): Promise<Buffer> {
  return sharp(pngWithAlpha).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}

export async function makeMaskPng(mask: Uint8Array, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(mask), {
    raw: {
      channels: 1,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}
