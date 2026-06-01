import "server-only";

import { randomUUID } from "node:crypto";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ASSETS_BUCKET = "assets";
const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9._-]+\.(xlsx|zip)$/;

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function createExportFilename(prefix: string, extension: "xlsx" | "zip") {
  return `${prefix}-${timestamp()}.${extension}`;
}

function assertSafeExportFilename(filename: string) {
  if (!SAFE_FILENAME_PATTERN.test(filename) || filename.includes("/") || filename.includes("\\")) {
    throw new Error("导出文件名无效");
  }
}

export function getExportContentType(filename: string) {
  return filename.endsWith(".xlsx")
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "application/zip";
}

function getExportExtension(filename: string) {
  return filename.endsWith(".xlsx") ? "xlsx" : "zip";
}

export async function writePublicExportFile(filename: string, content: Buffer | Uint8Array) {
  assertSafeExportFilename(filename);

  const supabase = createSupabaseServiceRoleClient();
  const datePath = new Date().toISOString().slice(0, 10);
  const extension = getExportExtension(filename);
  const storagePath = `exports/${datePath}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(storagePath, content, {
    contentType: getExportContentType(filename),
    upsert: false,
  });

  if (error) {
    throw new Error(`导出文件上传到 Supabase Storage 失败：${error.message}`);
  }

  const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(storagePath);

  return {
    downloadUrl: data.publicUrl,
    storagePath,
  };
}

export function sanitizeFileSegment(value: string | null | undefined, fallback: string) {
  const source = value?.trim() || fallback;
  const sanitized = source
    .replaceAll("\\", "-")
    .replaceAll("/", "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return (sanitized || fallback).slice(0, 80);
}

export function inferImageExtension(url: string, contentType: string | null) {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.includes(".")
      ? pathname.slice(pathname.lastIndexOf(".")).toLowerCase()
      : "";

    if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      return extension;
    }
  } catch {
    // Fall back to content type below.
  }

  if (contentType?.includes("jpeg")) {
    return ".jpg";
  }

  if (contentType?.includes("png")) {
    return ".png";
  }

  if (contentType?.includes("webp")) {
    return ".webp";
  }

  return ".jpg";
}
