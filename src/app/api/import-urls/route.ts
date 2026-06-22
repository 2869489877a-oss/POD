import { NextResponse } from "next/server";
import sharp from "sharp";

import { assertSafeHttpUrl, safeFetchBuffer } from "@/lib/network/safe-fetch";
import { deleteLocalAssetByPublicUrl, saveLocalAsset } from "@/lib/storage/local-assets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Unable to parse request body." }, { status: 400 });
  }

  const urls = body.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "Please provide at least one image URL." }, { status: 400 });
  }

  if (urls.length > 100) {
    return NextResponse.json({ error: "A single import supports up to 100 image URLs." }, { status: 400 });
  }

  const results: ImportResult[] = [];

  for (const url of urls) {
    results.push(await importSingleImage(url, request));
  }

  return NextResponse.json({
    failed_count: results.filter((result) => !result.success).length,
    results,
    success_count: results.filter((result) => result.success).length,
  });
}

async function importSingleImage(sourceUrl: string, request: Request): Promise<ImportResult> {
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
      throw new Error("Unable to read image metadata.");
    }

    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new Error(`Unsupported image format: ${metadata.format}`);
    }

    const finalFormat = FORMAT_MAP[metadata.format] || metadata.format;
    const finalBuffer = metadata.format === "gif" ? await sharp(buffer).png().toBuffer() : buffer;
    const filename = ensureImageExtension(extractFilename(safeSourceUrl), finalFormat);
    const supabase = createSupabaseServiceRoleClient();
    const savedAsset = await saveLocalAsset({
      buffer: finalBuffer,
      filename,
      request,
    });
    const originalUrl = savedAsset.publicUrl;

    const { data: asset, error: insertError } = await supabase
      .from("assets")
      .insert({
        copyright_status: "unknown",
        file_size: finalBuffer.length,
        filename,
        format: finalFormat,
        height: metadata.height,
        original_url: originalUrl,
        source: "link",
        status: "uploaded",
        width: metadata.width,
      })
      .select("id")
      .single();

    if (insertError) {
      await deleteLocalAssetByPublicUrl(originalUrl);
      throw new Error(`Failed to write asset record: ${insertError.message}`);
    }

    return {
      asset_id: asset.id,
      file_size: finalBuffer.length,
      filename,
      format: finalFormat,
      height: metadata.height,
      original_url: originalUrl,
      source_url: sourceUrl,
      success: true,
      width: metadata.width,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Import failed",
      source_url: sourceUrl,
      success: false,
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

function ensureImageExtension(filename: string, format: string) {
  const extension = format === "jpeg" ? ".jpg" : `.${format}`;
  const basename = filename.replace(/\.[a-zA-Z0-9]{1,8}$/, "");
  return `${basename}${extension}`;
}