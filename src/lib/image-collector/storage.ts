import { randomUUID } from "node:crypto";

import { safePathSegment } from "@/lib/image-collector/url";
import type { UploadedCollectedImage } from "@/lib/image-collector/types";
import { saveLocalAssetAtPath } from "@/lib/storage/local-assets";

type UploadCollectedImageInput = {
  buffer: Buffer;
  contentType: string;
  filename: string;
  rootFolder: string;
  sourceFolder: string;
};

function normalizeRootFolder(value: string) {
  const cleaned = value.replace(/^\/+|\/+$/g, "");
  return cleaned || "collections";
}

export async function uploadCollectedImage({
  buffer,
  filename,
  rootFolder,
  sourceFolder,
}: UploadCollectedImageInput): Promise<UploadedCollectedImage> {
  const storagePath = [
    normalizeRootFolder(rootFolder),
    safePathSegment(sourceFolder, "source"),
    `${randomUUID()}-${safePathSegment(filename, "image.jpg")}`,
  ].join("/");
  const savedImage = await saveLocalAssetAtPath({
    buffer,
    relativePath: storagePath,
  });

  return {
    publicUrl: savedImage.publicUrl,
    storagePath,
  };
}