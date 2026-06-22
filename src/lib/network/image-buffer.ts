import "server-only";

import path from "node:path";

import { safeFetchBinary } from "@/lib/network/safe-fetch";
import { readLocalAssetByPublicUrl } from "@/lib/storage/local-assets";

type ReadImageOptions = {
  maxBytes?: number;
  timeoutMs?: number;
};

export type ReadImageBinaryResult = {
  buffer: Buffer;
  contentType: string | null;
  source: "local" | "remote";
};

function contentTypeFromUrl(url: string) {
  let pathname = url;

  try {
    pathname = new URL(url, "http://local.invalid").pathname;
  } catch {
    // Keep the original value.
  }

  const extension = path.extname(pathname).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return null;
}

export async function readImageBinary(url: string, options: ReadImageOptions = {}): Promise<ReadImageBinaryResult> {
  const localBuffer = await readLocalAssetByPublicUrl(url);

  if (localBuffer) {
    const maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
    if (localBuffer.byteLength > maxBytes) {
      throw new Error(`Local image exceeds ${Math.round(maxBytes / 1024 / 1024)}MB`);
    }

    return {
      buffer: localBuffer,
      contentType: contentTypeFromUrl(url),
      source: "local",
    };
  }

  const remote = await safeFetchBinary(url, {
    allowedContentTypes: ["image/"],
    maxBytes: options.maxBytes ?? 25 * 1024 * 1024,
    timeoutMs: options.timeoutMs ?? 30_000,
  });

  return {
    ...remote,
    source: "remote",
  };
}

export async function readImageBuffer(url: string, options: ReadImageOptions = {}) {
  return (await readImageBinary(url, options)).buffer;
}
