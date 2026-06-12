import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ASSETS_BUCKET = "assets";
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const CONTENT_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const UPLOAD_ASSET_SOURCES = ["upload_original", "print_transparent", "garment_base"] as const;
type UploadAssetSource = (typeof UPLOAD_ASSET_SOURCES)[number];

type UploadResult = {
  asset_id?: string;
  error?: string;
  file_size: number;
  filename: string;
  format?: string;
  height?: number;
  original_url?: string;
  source?: UploadAssetSource;
  success: boolean;
  width?: number;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function sanitizeFilename(filename: string) {
  const normalized = filename.trim().replaceAll("\\", "-").replaceAll("/", "-");
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "-") || "image";
}

function parseAssetSource(value: FormDataEntryValue | null): UploadAssetSource {
  if (typeof value === "string" && UPLOAD_ASSET_SOURCES.includes(value as UploadAssetSource)) {
    return value as UploadAssetSource;
  }

  return "upload_original";
}

function getCategoryWriteFields(source: UploadAssetSource, originalUrl: string) {
  if (source === "print_transparent") {
    return {
      print_extract_url: originalUrl,
      preferred_design_url: originalUrl,
    };
  }

  return {};
}

async function uploadImage(file: File, assetSource: UploadAssetSource): Promise<UploadResult> {
  try {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("文件大小超过限制（最大 20MB）");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error("无法读取图片宽高或格式");
    }

    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new Error("图片格式不在允许范围内");
    }

    const contentType = CONTENT_TYPES[metadata.format];
    const supabase = createSupabaseServiceRoleClient();
    const datePath = new Date().toISOString().slice(0, 10);
    const storagePath = `${datePath}/${randomUUID()}-${sanitizeFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage 上传失败：${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(ASSETS_BUCKET)
      .getPublicUrl(storagePath);

    const originalUrl = publicUrlData.publicUrl;
    const { data: asset, error: insertError } = await supabase
      .from("assets")
      .insert({
        ...getCategoryWriteFields(assetSource, originalUrl),
        copyright_status: "unknown",
        file_size: file.size,
        filename: file.name,
        format: metadata.format,
        height: metadata.height,
        original_url: originalUrl,
        source: assetSource,
        status: "uploaded",
        width: metadata.width,
      })
      .select("id")
      .single();

    if (insertError) {
      await supabase.storage.from(ASSETS_BUCKET).remove([storagePath]);
      throw new Error(`assets 写入失败：${insertError.message}`);
    }

    return {
      asset_id: asset.id,
      file_size: file.size,
      filename: file.name,
      format: metadata.format,
      height: metadata.height,
      original_url: originalUrl,
      source: assetSource,
      success: true,
      width: metadata.width,
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      file_size: file.size,
      filename: file.name,
      source: assetSource,
      success: false,
    };
  }
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "无法读取上传表单", results: [] },
      { status: 400 },
    );
  }

  const assetSource = parseAssetSource(formData.get("asset_source"));
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "请选择至少一张图片", results: [] },
      { status: 400 },
    );
  }

  const results = await Promise.all(files.map((file) => uploadImage(file, assetSource)));
  const hasSuccess = results.some((result) => result.success);

  return NextResponse.json(
    {
      results,
      success_count: results.filter((result) => result.success).length,
      failed_count: results.filter((result) => !result.success).length,
    },
    { status: hasSuccess ? 200 : 400 },
  );
}
