import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import sharp from "sharp";

import { readImageBuffer } from "@/lib/network/image-buffer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

type SplitGridRequest = {
  columns?: unknown;
  image_url?: unknown;
  rows?: unknown;
  save_to_assets?: unknown;
  source_names?: unknown;
  split_mode?: unknown;
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

type ExtractRect = { height: number; left: number; top: number; width: number };

// Detection runs on a downscaled copy for speed; results are mapped back to full resolution.
const DETECT_MAX_DIM = 480;
const ALPHA_BG_THRESHOLD = 24; // alpha <= this counts as background (transparent sheets)
const COLOR_BG_DISTANCE = 40; // colour distance from the sampled background counts as content (solid sheets)

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

// ----- content-aware print detection -----
// The AI sheets place prints irregularly on a transparent (or solid) background, so a fixed
// even grid slices through artwork. Instead we segment the actual print regions and crop to each.

type Box = { area: number; x0: number; x1: number; y0: number; y1: number };

async function buildContentMask(buffer: Buffer, dw: number, dh: number) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(dw, dh, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const total = dw * dh;
  const corners = [0, dw - 1, (dh - 1) * dw, dw * dh - 1];
  let alphaSum = 0;
  for (const corner of corners) alphaSum += data[corner * channels + 3];
  const transparentBackground = alphaSum / corners.length < 128;
  const mask = new Uint8Array(total);

  if (transparentBackground) {
    for (let i = 0; i < total; i += 1) {
      mask[i] = data[i * channels + 3] > ALPHA_BG_THRESHOLD ? 1 : 0;
    }
    return mask;
  }

  let r = 0;
  let g = 0;
  let b = 0;
  for (const corner of corners) {
    r += data[corner * channels];
    g += data[corner * channels + 1];
    b += data[corner * channels + 2];
  }
  r /= corners.length;
  g /= corners.length;
  b /= corners.length;
  for (let i = 0; i < total; i += 1) {
    const alpha = data[i * channels + 3];
    const dr = data[i * channels] - r;
    const dg = data[i * channels + 1] - g;
    const db = data[i * channels + 2] - b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[i] = alpha > ALPHA_BG_THRESHOLD && distance > COLOR_BG_DISTANCE ? 1 : 0;
  }
  return mask;
}

function labelComponents(mask: Uint8Array, w: number, h: number): Box[] {
  const visited = new Uint8Array(w * h);
  const boxes: Box[] = [];
  const stack: number[] = [];

  for (let start = 0; start < w * h; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) continue;
    visited[start] = 1;
    stack.length = 0;
    stack.push(start);
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let area = 0;

    while (stack.length > 0) {
      const p = stack.pop() as number;
      const px = p % w;
      const py = (p / w) | 0;
      area += 1;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (mask[np] === 1 && visited[np] === 0) {
            visited[np] = 1;
            stack.push(np);
          }
        }
      }
    }

    boxes.push({ area, x0, x1, y0, y1 });
  }

  return boxes;
}

function closeOrOverlap(a: Box, b: Box, gap: number) {
  return !(a.x0 - b.x1 > gap || b.x0 - a.x1 > gap || a.y0 - b.y1 > gap || b.y0 - a.y1 > gap);
}

// Glyphs / loose elements of one print are merged; prints separated by the sheet's margins stay apart.
function mergeBoxes(boxes: Box[], gap: number): Box[] {
  let current = boxes.map((box) => ({ ...box }));
  let changed = true;

  while (changed) {
    changed = false;
    const out: Box[] = [];
    for (const box of current) {
      let merged = false;
      for (const target of out) {
        if (closeOrOverlap(target, box, gap)) {
          target.x0 = Math.min(target.x0, box.x0);
          target.y0 = Math.min(target.y0, box.y0);
          target.x1 = Math.max(target.x1, box.x1);
          target.y1 = Math.max(target.y1, box.y1);
          target.area += box.area;
          merged = true;
          changed = true;
          break;
        }
      }
      if (!merged) out.push({ ...box });
    }
    current = out;
  }

  return current;
}

async function detectPrintRects(buffer: Buffer, width: number, height: number): Promise<ExtractRect[] | null> {
  const scale = Math.max(1, Math.max(width, height) / DETECT_MAX_DIM);
  const dw = Math.max(1, Math.round(width / scale));
  const dh = Math.max(1, Math.round(height / scale));
  const mask = await buildContentMask(buffer, dw, dh);

  const minSide = Math.max(3, Math.round(Math.min(dw, dh) * 0.04));
  const gap = Math.max(4, Math.round(Math.min(dw, dh) * 0.045));
  const rawBoxes = labelComponents(mask, dw, dh).filter(
    (box) => box.x1 - box.x0 + 1 >= 2 && box.y1 - box.y0 + 1 >= 2,
  );
  const merged = mergeBoxes(rawBoxes, gap);
  const minArea = dw * dh * 0.004;
  const filtered = merged.filter(
    (box) =>
      box.x1 - box.x0 + 1 >= minSide &&
      box.y1 - box.y0 + 1 >= minSide &&
      (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1) >= minArea,
  );

  if (filtered.length < 2) return null;

  const rowGap = Math.min(dh * 0.12, 40);
  filtered.sort((a, b) => {
    const ay = (a.y0 + a.y1) / 2;
    const by = (b.y0 + b.y1) / 2;
    if (Math.abs(ay - by) > rowGap) return ay - by;
    return (a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2;
  });

  const pad = Math.round(Math.min(width, height) * 0.01);
  return filtered.map((box) => {
    const left = Math.max(0, Math.floor(box.x0 * scale) - pad);
    const top = Math.max(0, Math.floor(box.y0 * scale) - pad);
    const right = Math.min(width, Math.ceil((box.x1 + 1) * scale) + pad);
    const bottom = Math.min(height, Math.ceil((box.y1 + 1) * scale) + pad);
    return { height: Math.max(1, bottom - top), left, top, width: Math.max(1, right - left) };
  });
}

function evenGridRects(width: number, height: number, rows: number, columns: number): ExtractRect[] {
  const pieceWidth = Math.floor(width / columns);
  const pieceHeight = Math.floor(height / rows);
  const rects: ExtractRect[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = column * pieceWidth;
      const top = row * pieceHeight;
      rects.push({
        height: row === rows - 1 ? height - top : pieceHeight,
        left,
        top,
        width: column === columns - 1 ? width - left : pieceWidth,
      });
    }
  }
  return rects;
}

async function savePiece(buffer: Buffer, filename: string, width: number, height: number): Promise<Pick<SplitPiece, "asset_id" | "result_url">> {
  const supabase = createSupabaseServiceRoleClient();
  const datePath = new Date().toISOString().slice(0, 10);
  const storagePath = `${datePath}/ai-grid-${randomUUID()}.png`;

  const resultUrl = (await saveLocalAssetAtPath({
    buffer,
    relativePath: storagePath,
  })).publicUrl;

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
    await deleteLocalAssetByPublicUrl(resultUrl);
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
  const requestedSplitMode = stringValue(body.split_mode);
  const splitMode: "content" | "grid" = requestedSplitMode === "content" ? "content" : "grid";
  const expectedPieces = rows * columns;

  try {
    const sourceBuffer = await readImageBuffer(imageUrl, {
      maxBytes: 35 * 1024 * 1024,
      timeoutMs: 45_000,
    });
    const metadata = await sharp(sourceBuffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      throw new Error("无法读取成品图尺寸");
    }

    if (Math.floor(width / columns) < 8 || Math.floor(height / rows) < 8) {
      throw new Error("成品图尺寸过小，无法拆分");
    }

    let mode: "content" | "grid" = splitMode;
    let rects: ExtractRect[] | null = null;

    if (splitMode === "content") {
      rects = await detectPrintRects(sourceBuffer, width, height).catch(() => null);
    }

    if (!rects || rects.length !== expectedPieces) {
      mode = "grid";
      rects = evenGridRects(width, height, rows, columns);
    }

    const pieces: SplitPiece[] = [];

    for (let index = 0; index < rects.length; index += 1) {
      const rect = rects[index];
      const buffer = await sharp(sourceBuffer)
        .extract({ height: rect.height, left: rect.left, top: rect.top, width: rect.width })
        .png()
        .toBuffer();
      const sourceName = sourceNames[index] || `grid-${index + 1}`;
      const filename = `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(sourceName)}-print.png`;
      const saved = saveToAssets
        ? await savePiece(buffer, filename, rect.width, rect.height)
        : { asset_id: null, result_url: null };

      pieces.push({
        ...saved,
        filename,
        height: rect.height,
        index,
        source_name: sourceNames[index] || null,
        width: rect.width,
      });
    }

    return NextResponse.json({
      columns,
      height,
      mode,
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
