import { NextResponse } from "next/server";
import sharp from "sharp";

import { logUsage } from "@/lib/auth/usage";
import { deleteLocalAssetByPublicUrl, saveLocalAsset } from "@/lib/storage/local-assets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file

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
  return error instanceof Error ? error.message : "Unknown error";
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
      preferred_design_url: originalUrl,
      print_extract_url: originalUrl,
    };
  }

  return {};
}

async function uploadImage(file: File, assetSource: UploadAssetSource, request: Request): Promise<UploadResult> {
  try {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("File size exceeds the 20MB limit.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error("Unable to read image dimensions or format.");
    }

    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new Error(`Unsupported image format: ${metadata.format}`);
    }

    const supabase = createSupabaseServiceRoleClient();
    const savedAsset = await saveLocalAsset({
      buffer,
      filename: file.name,
      request,
    });
    const originalUrl = savedAsset.publicUrl;

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
      await deleteLocalAssetByPublicUrl(originalUrl);
      throw new Error(`Failed to write asset record: ${insertError.message}`);
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
    return NextResponse.json({ error: "Unable to read upload form.", results: [] }, { status: 400 });
  }

  const assetSource = parseAssetSource(formData.get("asset_source"));
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Please select at least one image.", results: [] }, { status: 400 });
  }

  const results: UploadResult[] = [];

  for (const file of files) {
    results.push(await uploadImage(file, assetSource, request));
  }

  const successCount = results.filter((result) => result.success).length;

  if (successCount > 0) {
    await logUsage("upload", successCount, { asset_source: assetSource });
  }

  return NextResponse.json(
    {
      failed_count: results.filter((result) => !result.success).length,
      results,
      success_count: successCount,
    },
    { status: successCount > 0 ? 200 : 400 },
  );
}