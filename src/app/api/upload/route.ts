import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ASSETS_BUCKET = "assets";
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const CONTENT_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

type UploadResult = {
  asset_id?: string;
  error?: string;
  file_size: number;
  filename: string;
  format?: string;
  height?: number;
  original_url?: string;
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

async function uploadImage(file: File): Promise<UploadResult> {
  try {
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
        copyright_status: "unknown",
        file_size: file.size,
        filename: file.name,
        format: metadata.format,
        height: metadata.height,
        original_url: originalUrl,
        source: "upload",
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
      success: true,
      width: metadata.width,
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      file_size: file.size,
      filename: file.name,
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

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "请选择至少一张图片", results: [] },
      { status: 400 },
    );
  }

  const results = await Promise.all(files.map((file) => uploadImage(file)));
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
