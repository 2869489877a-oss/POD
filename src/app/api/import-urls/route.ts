import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { assertSafeHttpUrl, safeFetchBuffer } from "@/lib/network/safe-fetch";

export const runtime = "nodejs";

const ASSETS_BUCKET = "assets";
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
const FORMAT_MAP: Record<string, string> = { gif: "png" };

type ImportResult = {
  source_url: string;
  success: boolean;
  asset_id?: string;
  original_url?: string;
  filename?: string;
  width?: number;
  height?: number;
  format?: string;
  file_size?: number;
  error?: string;
};

export async function POST(request: Request) {
  let body: { urls?: string[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无法解析请求体" }, { status: 400 });
  }

  const urls = body.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "请提供至少一个图片 URL" }, { status: 400 });
  }

  if (urls.length > 100) {
    return NextResponse.json({ error: "单次最多导入 100 张图片" }, { status: 400 });
  }

  const results: ImportResult[] = await Promise.all(
    urls.map((url) => importSingleImage(url)),
  );

  return NextResponse.json({
    results,
    success_count: results.filter((r) => r.success).length,
    failed_count: results.filter((r) => !r.success).length,
  });
}

async function importSingleImage(sourceUrl: string): Promise<ImportResult> {
  try {
    const safeSourceUrl = assertSafeHttpUrl(sourceUrl);
    const buffer = await safeFetchBuffer(safeSourceUrl, {
      allowedContentTypes: ["image/"],
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      maxBytes: 25 * 1024 * 1024,
      timeoutMs: 30_000,
    });

    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error("无法读取图片元数据");
    }

    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new Error(`不支持的格式：${metadata.format}`);
    }

    const finalFormat = FORMAT_MAP[metadata.format] || metadata.format;
    const finalBuffer = metadata.format === "gif"
      ? await sharp(buffer).png().toBuffer()
      : buffer;

    const supabase = createSupabaseServiceRoleClient();
    const datePath = new Date().toISOString().slice(0, 10);
    const filename = extractFilename(safeSourceUrl);
    const storagePath = `${datePath}/${randomUUID()}-${filename}`;

    const contentType = `image/${finalFormat}`;
    const { error: uploadError } = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(storagePath, finalBuffer, { contentType, upsert: false });

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
        original_url: originalUrl,
        filename,
        file_size: finalBuffer.length,
        width: metadata.width,
        height: metadata.height,
        format: finalFormat,
        status: "uploaded",
        source: "link",
        copyright_status: "unknown",
      })
      .select("id")
      .single();

    if (insertError) {
      await supabase.storage.from(ASSETS_BUCKET).remove([storagePath]);
      throw new Error(`数据库写入失败：${insertError.message}`);
    }

    return {
      source_url: sourceUrl,
      success: true,
      asset_id: asset.id,
      original_url: originalUrl,
      filename,
      width: metadata.width,
      height: metadata.height,
      format: finalFormat,
      file_size: finalBuffer.length,
    };
  } catch (error) {
    return {
      source_url: sourceUrl,
      success: false,
      error: error instanceof Error ? error.message : "导入失败",
    };
  }
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const name = pathname.split("/").pop() || "image";
    return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "image";
  } catch {
    return "image";
  }
}
