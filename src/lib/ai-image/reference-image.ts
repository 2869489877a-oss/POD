import "server-only";

import path from "node:path";

import { readImageBinary } from "@/lib/network/image-buffer";

const MAX_REFERENCE_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_IMAGE_CONTENT_TYPE = "image/png";

type PreparedReferenceImage = {
  base64: string;
  contentType: string;
};

function cleanBase64(value: string) {
  return value.replace(/\s/g, "");
}

function inlineReferenceImage(value: string): PreparedReferenceImage | null {
  const trimmed = value.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);

  if (dataUrlMatch) {
    return {
      base64: cleanBase64(dataUrlMatch[2]),
      contentType: normalizeImageContentType(dataUrlMatch[1], trimmed),
    };
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && cleanBase64(trimmed).length > 1000) {
    return {
      base64: cleanBase64(trimmed),
      contentType: DEFAULT_IMAGE_CONTENT_TYPE,
    };
  }

  return null;
}

function inferImageContentTypeFromUrl(url: string) {
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
  return DEFAULT_IMAGE_CONTENT_TYPE;
}

function normalizeImageContentType(contentType: string | null, source: string) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();

  if (normalized === "image/jpeg" || normalized === "image/png" || normalized === "image/webp") {
    return normalized;
  }

  return inferImageContentTypeFromUrl(source);
}

async function prepareReferenceImage(referenceUrl: string): Promise<PreparedReferenceImage> {
  const inlineImage = inlineReferenceImage(referenceUrl);
  if (inlineImage) return inlineImage;

  const image = await readImageBinary(referenceUrl, {
    maxBytes: MAX_REFERENCE_IMAGE_BYTES,
    timeoutMs: 30_000,
  });

  return {
    base64: image.buffer.toString("base64"),
    contentType: normalizeImageContentType(image.contentType, referenceUrl),
  };
}

export async function resolveReferenceImageBase64(referenceUrl: string) {
  return (await prepareReferenceImage(referenceUrl)).base64;
}

export async function resolveReferenceImageDataUrl(referenceUrl: string) {
  const image = await prepareReferenceImage(referenceUrl);
  return `data:${image.contentType};base64,${image.base64}`;
}