import "server-only";

import sharp from "sharp";

import { safeFetchBinary } from "@/lib/network/safe-fetch";

export async function computeAverageHash(buffer: Buffer) {
  const pixels = await sharp(buffer)
    .resize(8, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let bits = "";

  for (const value of pixels) {
    bits += value >= average ? "1" : "0";
  }

  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }

  return hex;
}

export async function computeAverageHashFromUrl(url: string) {
  const { buffer } = await safeFetchBinary(url, {
    allowedContentTypes: ["image/"],
    maxBytes: 15 * 1024 * 1024,
    timeoutMs: 30_000,
  });

  return computeAverageHash(buffer);
}
