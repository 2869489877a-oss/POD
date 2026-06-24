import "server-only";

import { randomUUID } from "crypto";

import sharp from "sharp";

import { makeBackgroundTransparent } from "@/lib/image-processing/transparent-background";
import { readImageBuffer } from "@/lib/network/image-buffer";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type SplitGridJobInput = {
  columns: number;
  imageUrl: string;
  rows: number;
  saveToAssets: boolean;
  sourceNames: string[];
  splitMode: "content" | "grid";
  transparentBackground: boolean;
};

export type SplitPiece = {
  asset_id: string | null;
  filename: string;
  height: number;
  index: number;
  result_url: string | null;
  source_name: string | null;
  width: number;
};

export type SplitGridResult = {
  columns: number;
  height: number;
  mode: "content" | "grid";
  pieces: SplitPiece[];
  rows: number;
  width: number;
};

type ExtractRect = { height: number; left: number; top: number; width: number };
type Box = { area: number; x0: number; x1: number; y0: number; y1: number };

type SplitGridJobRow = {
  columns: number;
  id: string;
  image_url: string;
  rows: number;
  save_to_assets: boolean;
  source_names: unknown;
  split_mode: string;
  status: string;
  transparent_background: boolean;
};

const DETECT_MAX_DIM = 480;
const ALPHA_BG_THRESHOLD = 24;
const COLOR_BG_DISTANCE = 40;

export function integerValue(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseSourceNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).slice(0, 16);
}

function sanitizeFilename(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "grid-piece";
}

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

async function savePiece(
  supabase: SupabaseServiceClient,
  buffer: Buffer,
  filename: string,
  width: number,
  height: number,
): Promise<Pick<SplitPiece, "asset_id" | "result_url">> {
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

function inputFromRow(row: SplitGridJobRow): SplitGridJobInput {
  return {
    columns: row.columns,
    imageUrl: row.image_url,
    rows: row.rows,
    saveToAssets: row.save_to_assets,
    sourceNames: parseSourceNames(row.source_names),
    splitMode: row.split_mode === "content" ? "content" : "grid",
    transparentBackground: row.transparent_background,
  };
}

export async function executeSplitGrid(input: SplitGridJobInput): Promise<SplitGridResult> {
  const expectedPieces = input.rows * input.columns;
  const sourceBuffer = await readImageBuffer(input.imageUrl, {
    maxBytes: 35 * 1024 * 1024,
    timeoutMs: 45_000,
  });
  const metadata = await sharp(sourceBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error("无法读取成品图尺寸");
  }

  if (Math.floor(width / input.columns) < 8 || Math.floor(height / input.rows) < 8) {
    throw new Error("成品图尺寸过小，无法拆分");
  }

  let mode: "content" | "grid" = input.splitMode;
  let rects: ExtractRect[] | null = null;

  if (input.splitMode === "content") {
    rects = await detectPrintRects(sourceBuffer, width, height).catch(() => null);
  }

  if (!rects || rects.length !== expectedPieces) {
    mode = "grid";
    rects = evenGridRects(width, height, input.rows, input.columns);
  }

  const supabase = createSupabaseServiceRoleClient();
  const pieces: SplitPiece[] = [];

  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index];
    const rawPieceBuffer = await sharp(sourceBuffer)
      .extract({ height: rect.height, left: rect.left, top: rect.top, width: rect.width })
      .png()
      .toBuffer();
    const buffer = input.transparentBackground
      ? await makeBackgroundTransparent(rawPieceBuffer, { feather: 16, tolerance: 52, transparency: 100 })
      : rawPieceBuffer;
    const sourceName = input.sourceNames[index] || `grid-${index + 1}`;
    const filename = `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(sourceName)}-print.png`;
    const saved = input.saveToAssets
      ? await savePiece(supabase, buffer, filename, rect.width, rect.height)
      : { asset_id: null, result_url: null };

    pieces.push({
      ...saved,
      filename,
      height: rect.height,
      index,
      source_name: input.sourceNames[index] || null,
      width: rect.width,
    });
  }

  return {
    columns: input.columns,
    height,
    mode,
    pieces,
    rows: input.rows,
    width,
  };
}

export async function createAiSplitGridJob(
  supabase: SupabaseServiceClient,
  input: SplitGridJobInput,
) {
  const { data, error } = await supabase
    .from("ai_split_grid_jobs")
    .insert({
      columns: input.columns,
      image_url: input.imageUrl,
      rows: input.rows,
      save_to_assets: input.saveToAssets,
      source_names: input.sourceNames,
      split_mode: input.splitMode,
      status: "pending",
      transparent_background: input.transparentBackground,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`创建拆图任务失败：${error.message}`);
  }

  const jobId = (data as unknown as { id?: string } | null)?.id;
  if (!jobId) {
    throw new Error("创建拆图任务失败：未返回任务 ID");
  }

  return { id: jobId };
}

export async function getAiSplitGridJob(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("ai_split_grid_jobs")
    .select("id,image_url,rows,columns,save_to_assets,source_names,split_mode,transparent_background,status,result,error_message,stage,progress_percent,started_at,finished_at,created_at,updated_at")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(`读取拆图任务失败：${error.message}`);
  }

  return data;
}

async function updateAiSplitGridProgress(
  supabase: SupabaseServiceClient,
  jobId: string,
  patch: {
    finished_at?: string | null;
    progress_percent?: number;
    stage?: string;
    started_at?: string | null;
    status?: string;
  },
) {
  const { error } = await supabase
    .from("ai_split_grid_jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) {
    throw new Error(`拆图任务进度回写失败：${error.message}`);
  }
}

export async function claimAiSplitGridJob(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("ai_split_grid_jobs")
    .select("id,image_url")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`领取拆图任务失败：${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ id: string; image_url: string }>) {
    const { data: claimed } = await supabase
      .from("ai_split_grid_jobs")
      .update({
        error_message: null,
        finished_at: null,
        progress_percent: 5,
        stage: "claimed",
        started_at: new Date().toISOString(),
        status: "processing",
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id,image_url")
      .maybeSingle();

    if (claimed) {
      return {
        image_url: row.image_url,
        item_id: row.id,
        job_id: row.id,
        job_type: "ai_split_grid" as const,
      };
    }
  }

  return null;
}

export async function executeAiSplitGridJob(
  supabase: SupabaseServiceClient,
  jobId: string,
) {
  const row = await getAiSplitGridJob(supabase, jobId) as unknown as SplitGridJobRow;
  const input = inputFromRow(row);

  try {
    await supabase
      .from("ai_split_grid_jobs")
      .update({
        error_message: null,
        finished_at: null,
        progress_percent: 10,
        stage: "loading_source",
        started_at: new Date().toISOString(),
        status: "processing",
      })
      .eq("id", jobId);

    await updateAiSplitGridProgress(supabase, jobId, { progress_percent: 30, stage: "splitting_grid" });
    const result = await executeSplitGrid(input);
    await updateAiSplitGridProgress(supabase, jobId, { progress_percent: 92, stage: "saving_results" });
    const { error } = await supabase
      .from("ai_split_grid_jobs")
      .update({
        error_message: null,
        finished_at: new Date().toISOString(),
        progress_percent: 100,
        result,
        stage: "completed",
        status: "completed",
      })
      .eq("id", jobId);

    if (error) {
      throw new Error(`拆图任务结果回写失败：${error.message}`);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "拆图任务失败";
    await supabase
      .from("ai_split_grid_jobs")
      .update({
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
        progress_percent: 100,
        stage: "failed",
        status: "failed",
      })
      .eq("id", jobId);
    throw new Error(errorMessage);
  }
}

export async function failAiSplitGridJob(
  supabase: SupabaseServiceClient,
  jobId: string,
  errorMessage: string,
) {
  const { data, error } = await supabase
    .from("ai_split_grid_jobs")
    .update({
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
      progress_percent: 100,
      stage: "failed",
      status: "failed",
    })
    .eq("id", jobId)
    .select("id,status,error_message")
    .single();

  if (error) {
    throw new Error(`拆图失败状态回写失败：${error.message}`);
  }

  return data;
}
