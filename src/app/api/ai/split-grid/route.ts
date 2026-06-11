import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { safeFetchBuffer } from "@/lib/network/safe-fetch";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type SplitGridRequest = {
  columns?: unknown;
  image_url?: unknown;
  rows?: unknown;
  save_to_assets?: unknown;
  source_names?: unknown;
};

type SplitPiece = {
  asset_id: string | null;
  filename: string;
  height: number;
  index: number;
  result_url: string | null;
  source_name: string | null;
  width: number;
};

const ASSETS_BUCKET = "assets";

function integerValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseSourceNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).slice(0, 16);
}

function sanitizeFilename(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "grid-piece";
}

async function savePiece(buffer: Buffer, filename: string, width: number, height: number): Promise<Pick<SplitPiece, "asset_id" | "result_url">> {
  const supabase = createSupabaseServiceRoleClient();
  const datePath = new Date().toISOString().slice(0, 10);
  const storagePath = `${datePath}/ai-grid-${randomUUID()}.png`;

  const { error: uploadError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`拆分结果上传失败：${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(storagePath);
  const resultUrl = publicUrlData.publicUrl;

  const { data: asset, error: insertError } = await supabase
    .from("assets")
    .insert({
      copyright_status: "owned",
      file_size: buffer.length,
      filename,
      format: "png",
      height,
      original_url: resultUrl,
      source: "ai",
      status: "uploaded",
      width,
    })
    .select("id")
    .single();

  if (insertError) {
    await supabase.storage.from(ASSETS_BUCKET).remove([storagePath]);
    throw new Error(`拆分结果写入素材库失败：${insertError.message}`);
  }

  return {
    asset_id: asset.id,
    result_url: resultUrl,
  };
}

export async function POST(request: Request) {
  let body: SplitGridRequest;

  try {
    body = (await request.json()) as SplitGridRequest;
  } catch {
    return NextResponse.json({ error: "无法解析拆图请求" }, { status: 400 });
  }

  const imageUrl = stringValue(body.image_url);
  if (!imageUrl) {
    return NextResponse.json({ error: "缺少待拆分图片 URL" }, { status: 400 });
  }

  const rows = integerValue(body.rows, 2, 1, 4);
  const columns = integerValue(body.columns, 2, 1, 4);
  const saveToAssets = body.save_to_assets !== false;
  const sourceNames = parseSourceNames(body.source_names);

  try {
    const sourceBuffer = await safeFetchBuffer(imageUrl, {
      allowedContentTypes: ["image/"],
      maxBytes: 35 * 1024 * 1024,
      timeoutMs: 45_000,
    });
    const image = sharp(sourceBuffer);
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      throw new Error("无法读取成品图尺寸");
    }

    const pieceWidth = Math.floor(width / columns);
    const pieceHeight = Math.floor(height / rows);
    if (pieceWidth < 8 || pieceHeight < 8) {
      throw new Error("成品图尺寸过小，无法按四宫格拆分");
    }

    const pieces: SplitPiece[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        const left = column * pieceWidth;
        const top = row * pieceHeight;
        const extractWidth = column === columns - 1 ? width - left : pieceWidth;
        const extractHeight = row === rows - 1 ? height - top : pieceHeight;
        const buffer = await sharp(sourceBuffer)
          .extract({ left, top, width: extractWidth, height: extractHeight })
          .png()
          .toBuffer();
        const sourceName = sourceNames[index] || `grid-${index + 1}`;
        const filename = `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(sourceName)}-print.png`;
        const saved = saveToAssets
          ? await savePiece(buffer, filename, extractWidth, extractHeight)
          : { asset_id: null, result_url: null };

        pieces.push({
          ...saved,
          filename,
          height: extractHeight,
          index,
          source_name: sourceNames[index] || null,
          width: extractWidth,
        });
      }
    }

    return NextResponse.json({
      columns,
      height,
      pieces,
      rows,
      width,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "拆分四宫格结果失败" },
      { status: 500 },
    );
  }
}
