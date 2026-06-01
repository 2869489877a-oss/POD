import { randomUUID } from "node:crypto";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { safePathSegment } from "@/lib/image-collector/url";
import type { UploadedCollectedImage } from "@/lib/image-collector/types";

const ASSETS_BUCKET = "assets";

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
  contentType,
  filename,
  rootFolder,
  sourceFolder,
}: UploadCollectedImageInput): Promise<UploadedCollectedImage> {
  const supabase = createSupabaseServiceRoleClient();
  const storagePath = [
    normalizeRootFolder(rootFolder),
    safePathSegment(sourceFolder, "source"),
    `${randomUUID()}-${safePathSegment(filename, "image.jpg")}`,
  ].join("/");
  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(`采集图片上传到 Supabase Storage 失败：${error.message}`);
  }

  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(storagePath);

  return {
    publicUrl: data.publicUrl,
    storagePath,
  };
}
