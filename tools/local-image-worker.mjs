#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createJiti } from "jiti";
import JSZip from "jszip";
import sharp from "sharp";

loadWorkerEnvFile(".env.local");
loadWorkerEnvFile(".env");

const BASE_URL = stripTrailingSlash(
  process.env.LOCAL_WORKER_BASE_URL ||
    process.env.POD_AI_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://127.0.0.1:3000",
);
const SECRET = (process.env.LOCAL_WORKER_SECRET || process.env.WORKER_SECRET || "").trim();
const CONCURRENCY = clampInt(process.env.LOCAL_IMAGE_WORKER_CONCURRENCY, 1, 8, 3);
const POLL_MS = clampInt(process.env.LOCAL_IMAGE_WORKER_POLL_MS, 500, 60_000, 1500);
const IDLE_LOG_MS = clampInt(process.env.LOCAL_IMAGE_WORKER_IDLE_LOG_MS, 10_000, 600_000, 60_000);
const IMAGE_JOB_TYPES = new Set(["cutout", "print_extraction", "mockup", "resize", "fission", "infringement_check"]);
const ASSET_DELETE_JOB_TYPE = "asset_delete";
const COLLECTOR_OPERATION_JOB_TYPE = "collector_operation";
const EXPORT_IMAGES_ZIP_JOB_TYPE = "export_images_zip";
const AI_SPLIT_GRID_JOB_TYPE = "ai_split_grid";
const AI_APPLY_PATTERN_JOB_TYPE = "ai_apply_pattern";
const AI_GENERATE_IMAGE_JOB_TYPE = "ai_generate_image";
const ALL_JOB_TYPES = [
  ...IMAGE_JOB_TYPES,
  ASSET_DELETE_JOB_TYPE,
  COLLECTOR_OPERATION_JOB_TYPE,
  EXPORT_IMAGES_ZIP_JOB_TYPE,
  AI_SPLIT_GRID_JOB_TYPE,
  AI_APPLY_PATTERN_JOB_TYPE,
  AI_GENERATE_IMAGE_JOB_TYPE,
];
const ALL_JOB_TYPE_SET = new Set(ALL_JOB_TYPES);
const DEFAULT_JOB_TYPE_LIMITS = {
  [AI_APPLY_PATTERN_JOB_TYPE]: 1,
  [AI_GENERATE_IMAGE_JOB_TYPE]: 1,
  [AI_SPLIT_GRID_JOB_TYPE]: 1,
  [ASSET_DELETE_JOB_TYPE]: 1,
  [COLLECTOR_OPERATION_JOB_TYPE]: 2,
  [EXPORT_IMAGES_ZIP_JOB_TYPE]: 1,
  cutout: 3,
  fission: 2,
  infringement_check: 3,
  mockup: 2,
  print_extraction: 2,
  resize: 3,
};
const JOB_TYPES = uniqueJobTypes(
  (process.env.LOCAL_IMAGE_WORKER_JOB_TYPES ||
    "cutout,print_extraction,mockup,resize,fission,infringement_check,asset_delete,collector_operation,export_images_zip,ai_split_grid,ai_apply_pattern,ai_generate_image")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && ALL_JOB_TYPE_SET.has(item)),
);
const JOB_TYPE_LIMITS = buildJobTypeLimits();
const LOCAL_ASSETS_DIR = path.resolve(
  process.env.LOCAL_ASSETS_DIR ||
    (process.platform === "win32"
      ? path.join(process.cwd(), ".local-assets", "assets")
      : "/wmsFile/pod-ai-data/assets"),
);
const WORKER_STATE_FILE = path.resolve(
  process.env.LOCAL_WORKER_STATE_FILE || path.join(path.dirname(LOCAL_ASSETS_DIR), "worker-status.json"),
);
const HEARTBEAT_MS = clampInt(process.env.LOCAL_IMAGE_WORKER_HEARTBEAT_MS, 1000, 60_000, 5000);
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const OCR_LANGS = process.env.OCR_LANGS?.trim() || "eng+chi_sim";
const OCR_PSM = process.env.OCR_PSM?.trim() || "11";
const OCR_TIMEOUT_MS = clampInt(process.env.OCR_TIMEOUT_MS, 5_000, 120_000, 25_000);
const OCR_MAX_DIM = clampInt(process.env.OCR_MAX_DIM, 600, 4000, 2000);
const FISSION_EFFECTS = new Set([
  "pattern_block",
  "pattern_brick",
  "pattern_half_drop",
  "pattern_reflect",
  "pattern_stripe",
  "echo",
  "kaleidoscope",
  "mirror_grid",
  "slice_shift",
  "tile_bloom",
]);
const INFRINGEMENT_REFERENCE_CACHE_MS = clampInt(
  process.env.LOCAL_WORKER_INFRINGEMENT_REFERENCE_CACHE_MS,
  0,
  60 * 60_000,
  5 * 60_000,
);

let stopping = false;
const STARTED_AT = new Date().toISOString();
const workerSlots = new Map();
let stateWriteQueue = Promise.resolve();
let infringementDetector = null;
let aiImageWorker = null;
let aiSplitGridWorker = null;
let aiApplyPatternWorker = null;
let infringementReferenceCache = null;
let claimCursor = 0;

process.on("SIGINT", () => {
  stopping = true;
  queueWorkerStateWrite("sigint");
});
process.on("SIGTERM", () => {
  stopping = true;
  queueWorkerStateWrite("sigterm");
});

function loadWorkerEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = normalized.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = normalized.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function clampInt(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numberValue)));
}

function uniqueJobTypes(items) {
  return Array.from(new Set(items));
}

function jobTypeEnvKey(jobType) {
  return `LOCAL_IMAGE_WORKER_${jobType.toUpperCase()}_CONCURRENCY`;
}

function legacyJobTypeEnvKey(jobType) {
  return `LOCAL_IMAGE_WORKER_CONCURRENCY_${jobType.toUpperCase()}`;
}

function parseJobTypeConcurrencyOverrides() {
  const overrides = new Map();
  const configured = process.env.LOCAL_IMAGE_WORKER_TYPE_CONCURRENCY || "";

  for (const entry of configured.split(/[;,]/)) {
    const normalized = entry.trim();
    if (!normalized) continue;

    const separatorIndex = normalized.includes("=") ? normalized.indexOf("=") : normalized.indexOf(":");
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    const value = normalized.slice(separatorIndex + 1).trim();
    if (key === "*" || ALL_JOB_TYPE_SET.has(key)) {
      overrides.set(key, value);
    }
  }

  return overrides;
}

function buildJobTypeLimits() {
  const limits = {};
  const overrides = parseJobTypeConcurrencyOverrides();
  const wildcardOverride = overrides.get("*");

  for (const jobType of JOB_TYPES) {
    const defaultLimit = DEFAULT_JOB_TYPE_LIMITS[jobType] ?? CONCURRENCY;
    const perTypeEnv =
      process.env[jobTypeEnvKey(jobType)] ??
      process.env[legacyJobTypeEnvKey(jobType)] ??
      overrides.get(jobType) ??
      wildcardOverride;
    limits[jobType] = clampInt(perTypeEnv, 0, CONCURRENCY, Math.min(CONCURRENCY, defaultLimit));
  }

  return limits;
}

function getJobTypeLimit(jobType) {
  return Math.max(0, Math.min(CONCURRENCY, JOB_TYPE_LIMITS[jobType] ?? CONCURRENCY));
}

function activeJobTypeCounts() {
  const counts = new Map();

  for (const slot of workerSlots.values()) {
    const jobType = slot?.job_type;
    if (!jobType) continue;
    if (!["claiming", "processing"].includes(slot.status) && !["claiming", "processing", "saving"].includes(slot.stage)) {
      continue;
    }

    counts.set(jobType, (counts.get(jobType) ?? 0) + 1);
  }

  return counts;
}

function claimableJobTypes() {
  const activeCounts = activeJobTypeCounts();
  return JOB_TYPES.filter((jobType) => (activeCounts.get(jobType) ?? 0) < getJobTypeLimit(jobType));
}

function rotatedJobTypes(jobTypes) {
  if (jobTypes.length <= 1) {
    return jobTypes;
  }

  const startIndex = claimCursor % jobTypes.length;
  claimCursor += 1;
  return [...jobTypes.slice(startIndex), ...jobTypes.slice(0, startIndex)];
}

function formatJobTypeLimits() {
  return JOB_TYPES.map((jobType) => `${jobType}=${getJobTypeLimit(jobType)}`).join(",");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeWorkerState(reason = "heartbeat") {
  const now = new Date().toISOString();
  const payload = {
    assets_dir: LOCAL_ASSETS_DIR,
    base_url: BASE_URL,
    concurrency: CONCURRENCY,
    heartbeat_ms: HEARTBEAT_MS,
    hostname: os.hostname(),
    job_type_limits: JOB_TYPE_LIMITS,
    job_types: JOB_TYPES,
    pid: process.pid,
    reason,
    slots: Array.from(workerSlots.values()).sort((a, b) => Number(a.worker_id) - Number(b.worker_id)),
    started_at: STARTED_AT,
    stopping,
    updated_at: now,
    worker: "local-image-worker",
  };
  const dir = path.dirname(WORKER_STATE_FILE);
  const tmpFile = `${WORKER_STATE_FILE}.${process.pid}.tmp`;

  await mkdir(dir, { recursive: true });
  await writeFile(tmpFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpFile, WORKER_STATE_FILE);
}

function queueWorkerStateWrite(reason = "heartbeat") {
  stateWriteQueue = stateWriteQueue
    .catch(() => undefined)
    .then(() => writeWorkerState(reason))
    .catch((error) => {
      console.error(`[local-image-worker] heartbeat write failed: ${getErrorMessage(error)}`);
    });
}

function setWorkerSlot(workerId, nextState) {
  const existing = workerSlots.get(workerId) || {};
  workerSlots.set(workerId, {
    ...existing,
    ...nextState,
    updated_at: new Date().toISOString(),
    worker_id: workerId,
  });
  queueWorkerStateWrite("slot-update");
}

function setWorkerIdle(workerId) {
  const current = workerSlots.get(workerId);
  if (current?.status === "idle" && current?.stage === "idle") {
    return;
  }

  setWorkerSlot(workerId, {
    asset_id: null,
    asset_filename: null,
    duration_ms: null,
    item_id: null,
    job_id: null,
    job_type: null,
    last_error: null,
    stage: "idle",
    started_at: null,
    status: "idle",
  });
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberOption(options, key, fallback) {
  const value = Number(options?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanOption(options, key, fallback) {
  return typeof options?.[key] === "boolean" ? options[key] : fallback;
}

function localAssetRelativePathFromUrl(url) {
  try {
    const pathname = new URL(url, "http://local.invalid").pathname;
    const prefix = "/uploads/assets/";
    if (!pathname.startsWith(prefix)) return null;
    return decodeURIComponent(pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function resolveLocalAssetPath(relativePath) {
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid local asset path");
  }

  const parts = relativePath.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "." || part === ".." || path.isAbsolute(part))) {
    throw new Error("Invalid local asset path");
  }

  const target = path.resolve(LOCAL_ASSETS_DIR, ...parts);
  const rootWithSeparator = LOCAL_ASSETS_DIR.endsWith(path.sep)
    ? LOCAL_ASSETS_DIR
    : `${LOCAL_ASSETS_DIR}${path.sep}`;

  if (target !== LOCAL_ASSETS_DIR && !target.startsWith(rootWithSeparator)) {
    throw new Error("Local asset path escapes storage root");
  }

  return target;
}

async function readImageBuffer(url) {
  const relativePath = localAssetRelativePathFromUrl(url);
  if (relativePath) {
    return readFile(resolveLocalAssetPath(relativePath));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`Unexpected content type: ${contentType || "unknown"}`);
    }

    const length = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES) {
      throw new Error("Image exceeds 25MB");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error("Image exceeds 25MB");
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeZipSegment(value, fallback) {
  const source = String(value || fallback || "item").trim();
  const sanitized = source
    .replaceAll("\\", "-")
    .replaceAll("/", "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return (sanitized || fallback || "item").slice(0, 80);
}

function inferImageExtensionFromUrl(url) {
  try {
    const pathname = new URL(url, "http://local.invalid").pathname.toLowerCase();
    const extension = pathname.includes(".") ? pathname.slice(pathname.lastIndexOf(".")) : "";
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      return extension;
    }
  } catch {
    // Fall through to the default.
  }

  return ".jpg";
}

function getExportRecordId(job) {
  return job.record_id || job.item_id || job.job_id;
}

function getInfringementDetector() {
  if (infringementDetector) {
    return infringementDetector;
  }

  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.resolve("src"),
    },
    interopDefault: true,
  });
  infringementDetector = jiti("../src/lib/infringement/detector.ts");
  return infringementDetector;
}

function getAiImageWorker() {
  if (aiImageWorker) {
    return aiImageWorker;
  }

  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.resolve("src"),
      "server-only": path.resolve("tools", "worker-server-only-stub.mjs"),
    },
    interopDefault: true,
  });
  const aiJobs = jiti("../src/lib/ai-image/worker-jobs.ts");
  const supabaseServer = jiti("../src/lib/supabase/server.ts");
  aiImageWorker = {
    createSupabaseServiceRoleClient: supabaseServer.createSupabaseServiceRoleClient,
    executeAiGenerateImageJob: aiJobs.executeAiGenerateImageJob,
  };
  return aiImageWorker;
}

function getAiSplitGridWorker() {
  if (aiSplitGridWorker) {
    return aiSplitGridWorker;
  }

  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.resolve("src"),
      "server-only": path.resolve("tools", "worker-server-only-stub.mjs"),
    },
    interopDefault: true,
  });
  const splitGridJobs = jiti("../src/lib/ai-image/split-grid-worker-jobs.ts");
  const supabaseServer = jiti("../src/lib/supabase/server.ts");
  aiSplitGridWorker = {
    createSupabaseServiceRoleClient: supabaseServer.createSupabaseServiceRoleClient,
    executeAiSplitGridJob: splitGridJobs.executeAiSplitGridJob,
  };
  return aiSplitGridWorker;
}

function getAiApplyPatternWorker() {
  if (aiApplyPatternWorker) {
    return aiApplyPatternWorker;
  }

  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.resolve("src"),
      "server-only": path.resolve("tools", "worker-server-only-stub.mjs"),
    },
    interopDefault: true,
  });
  const applyPatternJobs = jiti("../src/lib/ai-image/apply-pattern-worker-jobs.ts");
  const supabaseServer = jiti("../src/lib/supabase/server.ts");
  aiApplyPatternWorker = {
    createSupabaseServiceRoleClient: supabaseServer.createSupabaseServiceRoleClient,
    executeAiApplyPatternJob: applyPatternJobs.executeAiApplyPatternJob,
  };
  return aiApplyPatternWorker;
}

async function computeAverageHash(buffer) {
  const pixels = await sharp(buffer)
    .resize(8, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  let bits = "";

  for (const value of pixels) {
    bits += value >= average ? "1" : "0";
  }

  let hex = "";
  for (let index = 0; index < bits.length; index += 4) {
    hex += parseInt(bits.slice(index, index + 4), 2).toString(16);
  }

  return hex;
}

async function extractTextFromImageBuffer(source) {
  let rendered = source;

  try {
    rendered = await sharp(source)
      .resize(OCR_MAX_DIM, OCR_MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .grayscale()
      .png()
      .toBuffer();
  } catch {
    rendered = source;
  }

  let dir = null;
  try {
    dir = await mkdtemp(path.join(os.tmpdir(), "pod-ocr-"));
    const inputPath = path.join(dir, "input.png");
    await writeFile(inputPath, rendered);
    return await runTesseract(inputPath);
  } catch {
    return null;
  } finally {
    if (dir) {
      await rm(dir, { force: true, recursive: true }).catch(() => undefined);
    }
  }
}

function runTesseract(inputPath) {
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;

    const proc = spawn("tesseract", [inputPath, "stdout", "-l", OCR_LANGS, "--psm", OCR_PSM], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(null);
    }, OCR_TIMEOUT_MS);

    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.on("error", () => finish(null));
    proc.on("close", (code) => finish(code === 0 ? stdout.trim() : null));
  });
}

async function normalizeToRgba(inputBuffer, maxSize) {
  const normalized = await sharp(inputBuffer)
    .rotate()
    .resize(maxSize, maxSize, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: Buffer.from(normalized.data),
    height: normalized.info.height,
    width: normalized.info.width,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorDistance(data, offset, color) {
  const r = (data[offset] ?? 0) - color.r;
  const g = (data[offset + 1] ?? 0) - color.g;
  const b = (data[offset + 2] ?? 0) - color.b;
  return Math.sqrt(r * r + g * g + b * b);
}

function luminanceRgb(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function luminance(data, offset) {
  return luminanceRgb(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
}

function saturationRgb(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function estimateEdgeBackgroundColor(data, width, height) {
  const buckets = new Map();
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 180));

  function addSample(x, y) {
    const offset = (y * width + x) * 4;
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 16) return;

    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) || { b: 0, count: 0, g: 0, r: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  for (let x = 0; x < width; x += sampleStep) {
    addSample(x, 0);
    addSample(x, height - 1);
  }
  for (let y = 0; y < height; y += sampleStep) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  const dominant = Array.from(buckets.values()).sort((a, b) => b.count - a.count)[0];
  if (!dominant) return { b: 255, g: 255, r: 255 };

  return {
    b: Math.round(dominant.b / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    r: Math.round(dominant.r / dominant.count),
  };
}

function applyTransparentBackgroundToRgba(data, width, height, options = {}) {
  const tolerance = clamp(options.tolerance ?? 42, 1, 180);
  const feather = clamp(options.feather ?? 18, 0, 80);
  const transparency = clamp(options.transparency ?? 100, 0, 100);
  const backgroundAlpha = Math.round(255 * (1 - transparency / 100));
  const background = estimateEdgeBackgroundColor(data, width, height);
  const backgroundIsLight = luminanceRgb(background.r, background.g, background.b) > 215;
  const total = width * height;
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  function isBackgroundCandidate(index) {
    const offset = index * 4;
    const alpha = data[offset + 3] ?? 255;
    if (alpha < 16) return true;
    if (colorDistance(data, offset, background) <= tolerance) return true;
    return backgroundIsLight && luminance(data, offset) >= 255 - tolerance * 0.35;
  }

  function enqueue(index) {
    if (index < 0 || index >= total || mask[index]) return;
    if (!isBackgroundCandidate(index)) return;
    mask[index] = 1;
    queue[tail] = index;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    if (mask[index]) {
      data[offset + 3] = Math.min(data[offset + 3] ?? 255, backgroundAlpha);
      continue;
    }

    if (feather <= 0) continue;

    const distance = colorDistance(data, offset, background);
    if (distance > tolerance + feather) continue;

    const x = index % width;
    const y = Math.floor(index / width);
    let touchesBackground = false;
    for (let dy = -1; dy <= 1 && !touchesBackground; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (mask[ny * width + nx]) {
          touchesBackground = true;
          break;
        }
      }
    }

    if (!touchesBackground) continue;
    const keepRatio = clamp((distance - tolerance) / feather, 0, 1);
    const currentAlpha = data[offset + 3] ?? 255;
    data[offset + 3] = Math.round(backgroundAlpha * (1 - keepRatio) + currentAlpha * keepRatio);
  }

  return background;
}

async function rgbaToPng(data, width, height) {
  return sharp(data, {
    raw: {
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

async function makeMaskPng(mask, width, height) {
  return sharp(Buffer.from(mask), {
    raw: {
      channels: 1,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

async function makeWhitePreview(png) {
  return sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}

function getAlphaBBox(data, width, height, padding = 0) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 255;
      if (alpha <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { height, width, x: 0, y: 0 };
  }

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + padding + 1);
  const bottom = Math.min(height, maxY + padding + 1);

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  };
}

function getMaskBBox(mask, width, height, padding = 0) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] <= 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { height: 0, width: 0, x: 0, y: 0 };
  }

  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + padding + 1);
  const bottom = Math.min(height, maxY + padding + 1);

  return {
    height: bottom - y,
    width: right - x,
    x,
    y,
  };
}

async function cropPngByBBox(png, bbox) {
  if (bbox.width <= 0 || bbox.height <= 0) return png;
  return sharp(png)
    .extract({
      height: Math.round(bbox.height),
      left: Math.round(bbox.x),
      top: Math.round(bbox.y),
      width: Math.round(bbox.width),
    })
    .png()
    .toBuffer();
}

async function processCutout(job) {
  const source = await readImageBuffer(job.input_url);
  const options = asRecord(job.options?.options);
  const maxSize = numberOption(options, "maxSize", 2200);
  const { data, height, width } = await normalizeToRgba(source, maxSize);
  const background = applyTransparentBackgroundToRgba(data, width, height, {
    feather: numberOption(options, "featherRadius", 18),
    tolerance: numberOption(options, "tolerance", 42),
    transparency: 100,
  });
  const shouldCrop = booleanOption(options, "cropToContent", true);
  const padding = numberOption(options, "padding", 20);
  const bbox = shouldCrop ? getAlphaBBox(data, width, height, padding) : { height, width, x: 0, y: 0 };
  let output = await rgbaToPng(data, width, height);
  output = shouldCrop ? await cropPngByBBox(output, bbox) : output;
  const outputMeta = await sharp(output).metadata();
  const mask = await sharp(output).extractChannel("alpha").png().toBuffer();
  const preview = await makeWhitePreview(output);

  return {
    bbox,
    files: {
      mask: { buffer: mask, contentType: "image/png", filename: "mask.png" },
      output: { buffer: output, contentType: "image/png", filename: "cutout.png" },
      preview: { buffer: preview, contentType: "image/jpeg", filename: "preview.jpg" },
    },
    height: outputMeta.height ?? bbox.height,
    metrics: {
      background,
      mode: job.options?.mode || "auto_background",
      source: "local-image-worker",
    },
    width: outputMeta.width ?? bbox.width,
  };
}

function createStrategyMask(data, width, height, mode, background, region, preserveWhiteInk, preserveBlackInk) {
  const mask = new Uint8Array(width * height);
  const backgroundLum = luminanceRgb(background.r, background.g, background.b);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (region && (x < region.x || y < region.y || x >= region.x + region.width || y >= region.y + region.height)) {
        continue;
      }

      const pixelIndex = y * width + x;
      const offset = pixelIndex * 4;
      const alpha = data[offset + 3] ?? 255;
      if (alpha < 16) continue;

      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      const lum = luminanceRgb(r, g, b);
      const saturation = saturationRgb(r, g, b);
      const distance = colorDistance(data, offset, background);
      const lumDelta = Math.abs(lum - backgroundLum);
      let keep = false;

      if (mode === "light_garment") {
        keep =
          (lum < 178 && distance > 28) ||
          (saturation > 0.22 && distance > 34) ||
          (preserveBlackInk && lum < 88) ||
          (preserveWhiteInk && lum > 230 && distance > 46);
      } else if (mode === "dark_garment") {
        keep =
          (lum > 108 && distance > 34) ||
          (saturation > 0.24 && distance > 40) ||
          (preserveWhiteInk && lum > 220) ||
          (preserveBlackInk && lum < 60 && distance > 55);
      } else {
        keep = distance > 54 && (saturation > 0.1 || lumDelta > 44);
      }

      mask[pixelIndex] = keep ? 255 : 0;
    }
  }

  return mask;
}

function createManualRectMask(data, width, height, region) {
  const mask = new Uint8Array(width * height);
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.ceil(region.x + region.width));
  const y1 = Math.min(height, Math.ceil(region.y + region.height));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * width + x;
      const alpha = data[index * 4 + 3] ?? 255;
      mask[index] = alpha > 16 ? 255 : 0;
    }
  }

  return mask;
}

function maskStats(mask) {
  let nonZero = 0;
  for (const value of mask) {
    if (value > 0) nonZero += 1;
  }
  return {
    nonZero,
    ratio: mask.length > 0 ? nonZero / mask.length : 0,
    total: mask.length,
  };
}

function removeSmallComponents(mask, width, height, minArea, keepCount = 12) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const output = new Uint8Array(total);
  const queue = new Int32Array(total);
  const components = [];

  for (let start = 0; start < total; start += 1) {
    if (visited[start] || mask[start] === 0) continue;

    let head = 0;
    let tail = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const pixels = [];

    visited[start] = 1;
    queue[tail] = start;
    tail += 1;

    while (head < tail) {
      const index = queue[head];
      head += 1;
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbors) {
        if (next < 0 || next >= total || visited[next] || mask[next] === 0) continue;
        const nx = next % width;
        const ny = Math.floor(next / width);
        if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
        visited[next] = 1;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (pixels.length >= minArea) {
      components.push({ area: pixels.length, bbox: { height: maxY - minY + 1, width: maxX - minX + 1, x: minX, y: minY }, pixels });
    }
  }

  for (const component of components.sort((a, b) => b.area - a.area).slice(0, keepCount)) {
    for (const index of component.pixels) output[index] = 255;
  }

  return output;
}

function applyAlphaMask(data, mask) {
  const output = Buffer.from(data);
  for (let index = 0; index < mask.length; index += 1) {
    output[index * 4 + 3] = Math.min(output[index * 4 + 3] ?? 255, mask[index] ?? 0);
  }
  return output;
}

function featherMask(mask, width, height, radius) {
  const r = Math.max(0, Math.min(4, Math.floor(radius)));
  if (r <= 0) return mask;

  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += mask[ny * width + nx] ?? 0;
          count += 1;
        }
      }
      output[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return output;
}

function parseManualRect(job, width, height) {
  const assetId = job.asset?.id;
  const manualRects = asRecord(job.options?.manual_rects);
  const raw = assetId ? asRecord(manualRects[assetId]) : {};
  const x = Number(raw.x);
  const y = Number(raw.y);
  const rectWidth = Number(raw.width);
  const rectHeight = Number(raw.height);

  if (![x, y, rectWidth, rectHeight].every(Number.isFinite) || rectWidth <= 0 || rectHeight <= 0) {
    return null;
  }

  return {
    height: Math.min(height - Math.max(0, y), rectHeight),
    width: Math.min(width - Math.max(0, x), rectWidth),
    x: Math.max(0, x),
    y: Math.max(0, y),
  };
}

function evaluatePrintStrategy(data, width, height, mode, region, options) {
  const background = estimateEdgeBackgroundColor(data, width, height);
  const selectedMode = mode === "light_garment" || mode === "dark_garment" ? mode : "high_contrast";
  const mask =
    mode === "manual_rect" && region
      ? createManualRectMask(data, width, height, region)
      : createStrategyMask(
          data,
          width,
          height,
          selectedMode,
          background,
          region,
          booleanOption(options, "preserveWhiteInk", true),
          booleanOption(options, "preserveBlackInk", true),
        );
  const stats = maskStats(mask);
  const bbox = getMaskBBox(mask, width, height, 0);
  const bboxAreaRatio = bbox.width > 0 && bbox.height > 0 ? (bbox.width * bbox.height) / (width * height) : 1;
  const areaScore = stats.ratio >= 0.002 && stats.ratio <= 0.85 ? 1 : 0;
  const bboxScore = bboxAreaRatio > 0 && bboxAreaRatio < 0.9 ? 1 : 0.35;
  const densityScore = bboxAreaRatio > 0 ? clamp(stats.ratio / bboxAreaRatio, 0, 1) : 0;

  return {
    background,
    confidence: clamp(areaScore * 0.5 + bboxScore * 0.25 + densityScore * 0.25, 0, 1),
    mask,
    mode: selectedMode,
    stats,
  };
}

async function processPrintExtraction(job) {
  const source = await readImageBuffer(job.input_url);
  const options = asRecord(job.options?.options);
  const maxSize = numberOption(options, "maxSize", 1800);
  const padding = numberOption(options, "padding", 40);
  const featherRadius = numberOption(options, "featherRadius", 1);
  const { data, height, width } = await normalizeToRgba(source, maxSize);
  const mode = job.options?.mode || "auto";
  const region = mode === "manual_rect" ? parseManualRect(job, width, height) : null;

  if (mode === "manual_rect" && !region) {
    throw new Error("manual_rect mode requires a valid rectangle for this asset");
  }

  const strategies =
    mode === "auto"
      ? ["light_garment", "dark_garment", "high_contrast"].map((strategy) =>
          evaluatePrintStrategy(data, width, height, strategy, region, options),
        )
      : [evaluatePrintStrategy(data, width, height, mode, region, options)];
  const rawResult = strategies.sort((a, b) => b.confidence - a.confidence)[0];
  const componentMinArea = numberOption(options, "minComponentArea", Math.max(24, Math.floor(width * height * 0.00005)));
  const finalMask = featherMask(removeSmallComponents(rawResult.mask, width, height, componentMinArea, 12), width, height, featherRadius);
  const stats = maskStats(finalMask);

  if (stats.ratio < 0.002) {
    throw new Error("Print extraction failed: no valid print area detected");
  }
  if (stats.ratio > 0.85) {
    throw new Error("Print extraction failed: detected print area is too large");
  }

  const bbox = getMaskBBox(finalMask, width, height, padding);
  if (bbox.width <= 0 || bbox.height <= 0) {
    throw new Error("Print extraction failed: invalid print bounds");
  }

  const rawPngFull = await rgbaToPng(applyAlphaMask(data, rawResult.mask), width, height);
  const finalPngFull = await rgbaToPng(applyAlphaMask(data, finalMask), width, height);
  const maskPngFull = await makeMaskPng(finalMask, width, height);
  const raw = await cropPngByBBox(rawPngFull, bbox);
  const output = await cropPngByBBox(finalPngFull, bbox);
  const mask = await cropPngByBBox(maskPngFull, bbox);
  const preview = await makeWhitePreview(output);
  const outputMeta = await sharp(output).metadata();

  return {
    bbox,
    files: {
      mask: { buffer: mask, contentType: "image/png", filename: "mask.png" },
      output: { buffer: output, contentType: "image/png", filename: "print-final.png" },
      preview: { buffer: preview, contentType: "image/jpeg", filename: "preview.jpg" },
      raw: { buffer: raw, contentType: "image/png", filename: "print-raw.png" },
    },
    height: outputMeta.height ?? bbox.height,
    metrics: {
      backgroundColor: rawResult.background,
      confidence: rawResult.confidence,
      maskAreaRatio: stats.ratio,
      mode,
      rawMaskAreaRatio: rawResult.stats.ratio,
      selectedStrategy: rawResult.mode,
      source: "local-image-worker",
    },
    width: outputMeta.width ?? bbox.width,
  };
}

function getResizeConfig(job) {
  const options = asRecord(job.options);
  const width = Math.round(Number(options.width));
  const height = Math.round(Number(options.height));
  const outputFormat = options.output_format === "jpg" || options.output_format === "jpeg" ? "jpg" : "png";
  const background = options.background === "transparent" ? "transparent" : "white";

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("resize task requires a valid width and height");
  }

  return {
    background,
    contentType: outputFormat === "jpg" ? "image/jpeg" : "image/png",
    extension: outputFormat,
    height,
    width,
  };
}

async function processResize(job) {
  const source = await readImageBuffer(job.input_url);
  const config = getResizeConfig(job);
  const image = sharp(source)
    .rotate()
    .resize(config.width, config.height, {
      background:
        config.background === "transparent"
          ? { alpha: 0, b: 0, g: 0, r: 0 }
          : { alpha: 1, b: 255, g: 255, r: 255 },
      fit: "contain",
      position: "center",
      withoutEnlargement: false,
    });
  const output =
    config.extension === "jpg"
      ? await image.flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer()
      : await image.png().toBuffer();

  return {
    bbox: { height: config.height, width: config.width, x: 0, y: 0 },
    files: {
      output: {
        buffer: output,
        contentType: config.contentType,
        filename: `resize.${config.extension}`,
      },
    },
    height: config.height,
    metrics: {
      background: config.background,
      output_format: config.extension,
      preset_key: job.options?.preset_key || null,
      source: "local-image-worker",
    },
    width: config.width,
  };
}

function getFissionConfig(job, metadata) {
  const options = asRecord(job.options?.options || job.options);
  const sourceWidth = metadata.width || 1024;
  const sourceHeight = metadata.height || 1024;
  const requestedWidth = Math.round(Number(options.output_width));
  const requestedHeight = Math.round(Number(options.output_height));
  const width = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : sourceWidth;
  const height = Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : sourceHeight;
  const requestedEffect = typeof options.effect_key === "string" ? options.effect_key : job.options?.mode || "pattern_half_drop";
  const effect = FISSION_EFFECTS.has(requestedEffect) ? requestedEffect : "pattern_half_drop";
  const background = parseFissionBackgroundColor(options.background_color);
  const requestedOutputFormat = options.output_format === "jpg" || options.output_format === "jpeg" ? "jpg" : "png";
  const outputFormat = background.alpha === 0 ? "png" : requestedOutputFormat;
  const rotation = clamp(numberOption(options, "rotation", 0), -180, 180);
  const spacing = clamp(numberOption(options, "spacing", 12), 0, 80);
  const strength = clamp(numberOption(options, "strength", 70), 0, 100);

  return {
    background,
    contentType: outputFormat === "jpg" ? "image/jpeg" : "image/png",
    effect,
    extension: outputFormat,
    height: Math.max(64, Math.min(5400, height)),
    rotation,
    spacing,
    strength,
    presetKey: typeof options.preset_key === "string" ? options.preset_key : null,
    width: Math.max(64, Math.min(5400, width)),
  };
}

function transparentBackground() {
  return { alpha: 0, b: 0, g: 0, r: 0 };
}

function parseFissionBackgroundColor(value) {
  if (typeof value !== "string" || value === "transparent") {
    return transparentBackground();
  }

  const normalized = value.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return transparentBackground();
  }

  return {
    alpha: 1,
    b: Number.parseInt(hex.slice(4, 6), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    r: Number.parseInt(hex.slice(0, 2), 16),
  };
}

function fissionCanvasBackground(config) {
  return config.extension === "jpg" && config.background.alpha === 0
    ? { alpha: 1, b: 255, g: 255, r: 255 }
    : config.background;
}

async function normalizeFissionSource(source, width, height, fit = "cover") {
  return sharp(source)
    .rotate()
    .resize(width, height, {
      background: transparentBackground(),
      fit,
      position: "center",
      withoutEnlargement: false,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function setImageOpacity(buffer, opacity) {
  const normalized = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = Buffer.from(normalized.data);
  const factor = clamp(opacity, 0, 1);

  for (let index = 3; index < data.length; index += 4) {
    data[index] = Math.round((data[index] ?? 0) * factor);
  }

  return sharp(data, {
    raw: {
      channels: 4,
      height: normalized.info.height,
      width: normalized.info.width,
    },
  }).png().toBuffer();
}

async function createPatternTile(source, config, reflected = false) {
  const sourceMeta = await sharp(source).metadata();
  const aspect = (sourceMeta.width || 1) / Math.max(1, sourceMeta.height || 1);
  const minSide = Math.min(config.width, config.height);
  const baseSize = Math.max(160, Math.round(minSide * (0.12 + config.strength / 420)));
  const tileWidth = Math.max(120, Math.min(Math.round(baseSize * Math.sqrt(aspect)), Math.round(config.width * 0.72)));
  const tileHeight = Math.max(120, Math.min(Math.round(baseSize / Math.sqrt(aspect)), Math.round(config.height * 0.72)));
  const tile = await normalizeFissionSource(source, tileWidth, tileHeight, "contain");
  const rotated = config.rotation === 0
    ? tile
    : await sharp(tile)
        .rotate(config.rotation, { background: transparentBackground() })
        .resize(tileWidth, tileHeight, {
          background: transparentBackground(),
          fit: "contain",
        })
        .png()
        .toBuffer();

  if (!reflected) {
    return { buffer: rotated, height: tileHeight, width: tileWidth };
  }

  const reflectedWidth = tileWidth * 2;
  const reflectedHeight = tileHeight * 2;
  const reflectedTile = await sharp({
    create: {
      background: transparentBackground(),
      channels: 4,
      height: reflectedHeight,
      width: reflectedWidth,
    },
  })
    .composite([
      { input: rotated, left: 0, top: 0 },
      { input: await sharp(rotated).flop().png().toBuffer(), left: tileWidth, top: 0 },
      { input: await sharp(rotated).flip().png().toBuffer(), left: 0, top: tileHeight },
      { input: await sharp(rotated).flip().flop().png().toBuffer(), left: tileWidth, top: tileHeight },
    ])
    .png()
    .toBuffer();

  return { buffer: reflectedTile, height: reflectedHeight, width: reflectedWidth };
}

async function renderPatternRepeat(source, config, mode) {
  const reflected = mode === "pattern_reflect";
  const tile = await createPatternTile(source, config, reflected);
  const gap = Math.round(Math.min(config.width, config.height) * (config.spacing / 260));
  const stepX = Math.max(1, tile.width + gap);
  const stepY = Math.max(1, tile.height + gap);
  const composites = [];
  const startY = -stepY;
  const endY = config.height + stepY;
  const startX = -stepX;
  const endX = config.width + stepX;

  for (let top = startY, row = 0; top <= endY; top += stepY, row += 1) {
    const rowOffset =
      mode === "pattern_brick" || mode === "pattern_half_drop" || mode === "pattern_stripe"
        ? Math.round((row % 2) * stepX * 0.5)
        : 0;
    const verticalShift = mode === "pattern_half_drop" && row % 2 === 1 ? Math.round(stepY * 0.5) : 0;
    const stripeSkew = mode === "pattern_stripe" ? Math.round((row % 3) * stepX * 0.22) : 0;

    for (let left = startX - rowOffset - stripeSkew; left <= endX; left += stepX) {
      composites.push({
        input: tile.buffer,
        left,
        top: top + verticalShift,
      });
    }
  }

  return sharp({
    create: {
      background: fissionCanvasBackground(config),
      channels: 4,
      height: config.height,
      width: config.width,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderMirrorGrid(source, config) {
  const cellWidth = Math.ceil(config.width / 2);
  const cellHeight = Math.ceil(config.height / 2);
  const tile = await normalizeFissionSource(source, cellWidth, cellHeight, "cover");
  const composites = [
    { input: tile, left: 0, top: 0 },
    { input: await sharp(tile).flop().png().toBuffer(), left: cellWidth, top: 0 },
    { input: await sharp(tile).flip().png().toBuffer(), left: 0, top: cellHeight },
    { input: await sharp(tile).flip().flop().png().toBuffer(), left: cellWidth, top: cellHeight },
  ];

  return sharp({
    create: {
      background: fissionCanvasBackground(config),
      channels: 4,
      height: cellHeight * 2,
      width: cellWidth * 2,
    },
  })
    .composite(composites)
    .resize(config.width, config.height, { fit: "fill" })
    .png()
    .toBuffer();
}

async function renderKaleidoscope(source, config) {
  const cellWidth = Math.ceil(config.width / 2);
  const cellHeight = Math.ceil(config.height / 2);
  const tile = await sharp(source)
    .rotate()
    .resize(cellWidth, cellHeight, {
      background: transparentBackground(),
      fit: "cover",
      position: "centre",
    })
    .modulate({
      brightness: 1 + (config.strength / 100) * 0.04,
      saturation: 1 + (config.strength / 100) * 0.18,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const diagonal = await setImageOpacity(
    await sharp(tile).rotate(45, { background: transparentBackground() }).resize(cellWidth, cellHeight, { fit: "cover" }).png().toBuffer(),
    0.22 + (config.strength / 100) * 0.18,
  );

  return sharp({
    create: {
      background: fissionCanvasBackground(config),
      channels: 4,
      height: cellHeight * 2,
      width: cellWidth * 2,
    },
  })
    .composite([
      { input: tile, left: 0, top: 0 },
      { input: await sharp(tile).flop().png().toBuffer(), left: cellWidth, top: 0 },
      { input: await sharp(tile).flip().png().toBuffer(), left: 0, top: cellHeight },
      { input: await sharp(tile).flip().flop().png().toBuffer(), left: cellWidth, top: cellHeight },
      { input: diagonal, left: Math.round(cellWidth / 2), top: Math.round(cellHeight / 2) },
    ])
    .resize(config.width, config.height, { fit: "fill" })
    .png()
    .toBuffer();
}

async function renderEchoSpread(source, config) {
  const base = await normalizeFissionSource(source, config.width, config.height, "contain");
  const shift = Math.round(Math.min(config.width, config.height) * (0.035 + config.strength / 2600));
  const copies = [
    { dx: -shift * 2, dy: shift * 2, opacity: 0.22 },
    { dx: shift * 2, dy: -shift, opacity: 0.18 },
    { dx: -shift, dy: -shift * 2, opacity: 0.14 },
    { dx: shift, dy: shift, opacity: 0.28 },
  ];
  const composites = [];

  for (const copy of copies) {
    composites.push({
      input: await setImageOpacity(base, copy.opacity + (config.strength / 100) * 0.12),
      left: copy.dx,
      top: copy.dy,
    });
  }
  composites.push({ input: base, left: 0, top: 0 });

  return sharp({
    create: {
      background: fissionCanvasBackground(config),
      channels: 4,
      height: config.height,
      width: config.width,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderSliceShift(source, config) {
  const base = await normalizeFissionSource(source, config.width, config.height, "cover");
  const sliceCount = Math.max(8, Math.min(28, Math.round(10 + config.strength / 5)));
  const sliceHeight = Math.ceil(config.height / sliceCount);
  const maxShift = Math.round(config.width * (0.03 + config.strength / 900));
  const composites = [];

  for (let index = 0; index < sliceCount; index += 1) {
    const top = index * sliceHeight;
    const height = Math.min(sliceHeight, config.height - top);
    if (height <= 0) continue;

    const slice = await sharp(base)
      .extract({ height, left: 0, top, width: config.width })
      .png()
      .toBuffer();
    const direction = index % 2 === 0 ? 1 : -1;
    const wave = Math.sin(index * 1.7) * 0.55 + 0.45;
    const left = Math.round(direction * maxShift * wave);

    composites.push({ input: slice, left, top });
    if (left > 0) composites.push({ input: slice, left: left - config.width, top });
    if (left < 0) composites.push({ input: slice, left: left + config.width, top });
  }

  return sharp({
    create: {
      background: fissionCanvasBackground(config),
      channels: 4,
      height: config.height,
      width: config.width,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderTileBloom(source, config) {
  const tileWidth = Math.ceil(config.width / 3);
  const tileHeight = Math.ceil(config.height / 3);
  const tile = await normalizeFissionSource(source, tileWidth, tileHeight, "cover");
  const composites = [];
  const angleStep = Math.round(6 + config.strength / 5);

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const index = row * 3 + col;
      const rotate = (index % 2 === 0 ? 1 : -1) * angleStep * (index % 3);
      const input = rotate === 0
        ? tile
        : await sharp(tile)
            .rotate(rotate, { background: transparentBackground() })
            .resize(tileWidth, tileHeight, { fit: "cover" })
            .png()
            .toBuffer();
      composites.push({ input, left: col * tileWidth, top: row * tileHeight });
    }
  }

  return sharp({
    create: {
      background: fissionCanvasBackground(config),
      channels: 4,
      height: tileHeight * 3,
      width: tileWidth * 3,
    },
  })
    .composite(composites)
    .resize(config.width, config.height, { fit: "fill" })
    .png()
    .toBuffer();
}

async function encodeFissionOutput(buffer, config) {
  if (config.extension === "jpg") {
    const background = config.background.alpha === 0
      ? "#ffffff"
      : {
          b: config.background.b,
          g: config.background.g,
          r: config.background.r,
        };
    return sharp(buffer).flatten({ background }).jpeg({ quality: 92 }).toBuffer();
  }

  return sharp(buffer).png({ compressionLevel: 9 }).toBuffer();
}

export async function processFission(job) {
  const source = await readImageBuffer(job.input_url);
  const metadata = await sharp(source).metadata();
  const config = getFissionConfig(job, metadata);
  let rendered;

  if (config.effect.startsWith("pattern_")) {
    rendered = await renderPatternRepeat(source, config, config.effect);
  } else if (config.effect === "kaleidoscope") {
    rendered = await renderKaleidoscope(source, config);
  } else if (config.effect === "echo") {
    rendered = await renderEchoSpread(source, config);
  } else if (config.effect === "slice_shift") {
    rendered = await renderSliceShift(source, config);
  } else if (config.effect === "tile_bloom") {
    rendered = await renderTileBloom(source, config);
  } else {
    rendered = await renderMirrorGrid(source, config);
  }

  const output = await encodeFissionOutput(rendered, config);
  const outputMeta = await sharp(output).metadata();

  return {
    bbox: { height: outputMeta.height ?? config.height, width: outputMeta.width ?? config.width, x: 0, y: 0 },
    files: {
      output: {
        buffer: output,
        contentType: config.contentType,
        filename: `fission.${config.extension}`,
      },
    },
    height: outputMeta.height ?? config.height,
    metrics: {
      background_alpha: config.background.alpha,
      effect: config.effect,
      output_format: config.extension,
      preset_key: config.presetKey,
      rotation: config.rotation,
      source: "local-image-worker",
      spacing: config.spacing,
      strength: config.strength,
    },
    width: outputMeta.width ?? config.width,
  };
}

function validateMockupScenes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("mockup task requires scenes");
  }

  return value.map((scene, index) => {
    const record = asRecord(scene);
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : `scene-${index + 1}`;
    const backgroundUrl = typeof record.background_url === "string" ? record.background_url.trim() : "";
    const outputWidth = Math.round(Number(record.output_width));
    const outputHeight = Math.round(Number(record.output_height));
    const needPrint = record.need_print === true;

    if (!backgroundUrl) {
      throw new Error(`mockup scene ${index + 1} is missing background_url`);
    }
    if (!Number.isFinite(outputWidth) || outputWidth <= 0 || !Number.isFinite(outputHeight) || outputHeight <= 0) {
      throw new Error(`mockup scene ${index + 1} has invalid output size`);
    }

    const validated = {
      background_url: backgroundUrl,
      name,
      need_print: needPrint,
      output_height: outputHeight,
      output_width: outputWidth,
    };

    if (needPrint) {
      const printArea = asRecord(record.print_area);
      const x = Number(printArea.x);
      const y = Number(printArea.y);
      const width = Number(printArea.width);
      const height = Number(printArea.height);

      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0) {
        throw new Error(`mockup scene ${index + 1} has invalid print_area`);
      }

      validated.print_area = { height, width, x, y };
    }

    return validated;
  });
}

async function renderMockupScene(scene, backgroundBuffer, printBuffer) {
  let image = sharp(backgroundBuffer)
    .rotate()
    .resize(scene.output_width, scene.output_height, {
      fit: "cover",
      position: "center",
    });

  if (scene.need_print && scene.print_area) {
    const printLayer = await sharp(printBuffer)
      .rotate()
      .resize(Math.round(scene.print_area.width), Math.round(scene.print_area.height), {
        background: { alpha: 0, b: 0, g: 0, r: 0 },
        fit: "contain",
        position: "center",
      })
      .png()
      .toBuffer();

    image = image.composite([
      {
        input: printLayer,
        left: Math.round(scene.print_area.x),
        top: Math.round(scene.print_area.y),
      },
    ]);
  }

  return image.png().toBuffer();
}

async function processMockup(job) {
  const scenes = validateMockupScenes(job.options?.scenes);
  const printBuffer = await readImageBuffer(job.input_url);
  const outputs = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const backgroundBuffer = await readImageBuffer(scene.background_url);
    const output = await renderMockupScene(scene, backgroundBuffer, printBuffer);
    outputs.push({
      buffer: output,
      contentType: "image/png",
      filename: `mockup-${String(index + 1).padStart(2, "0")}.png`,
    });
  }

  return {
    files: {
      outputs,
    },
  };
}

async function fetchInfringementPayload(job) {
  const cacheAvailable =
    INFRINGEMENT_REFERENCE_CACHE_MS > 0 &&
    infringementReferenceCache &&
    infringementReferenceCache.expiresAt > Date.now();
  const includeReference = cacheAvailable ? "0" : "1";
  let data = await apiFetch(`/api/local-worker/jobs/${encodeURIComponent(job.item_id)}/payload?include_reference=${includeReference}`, {
    method: "GET",
  });

  if (!data.payload) {
    throw new Error("infringement payload is missing");
  }

  let payload = data.payload;
  let cacheFresh =
    cacheAvailable &&
    infringementReferenceCache &&
    typeof payload.reference_version === "string" &&
    payload.reference_version === infringementReferenceCache.version;

  if (cacheAvailable && !cacheFresh) {
    data = await apiFetch(`/api/local-worker/jobs/${encodeURIComponent(job.item_id)}/payload?include_reference=1`, {
      method: "GET",
    });

    if (!data.payload) {
      throw new Error("infringement payload is missing");
    }

    payload = data.payload;
    cacheFresh = false;
  }

  if (payload.reference_items_included && Array.isArray(payload.reference_items)) {
    infringementReferenceCache = {
      expiresAt: Date.now() + INFRINGEMENT_REFERENCE_CACHE_MS,
      items: payload.reference_items,
      version: typeof payload.reference_version === "string" ? payload.reference_version : "unknown",
    };
    cacheFresh = true;
  }

  return {
    ...payload,
    reference_items: cacheFresh && infringementReferenceCache ? infringementReferenceCache.items : Array.isArray(payload.reference_items) ? payload.reference_items : [],
  };
}

async function processInfringementCheck(job) {
  const payload = await fetchInfringementPayload(job);
  const detector = getInfringementDetector();
  const source = await readImageBuffer(payload.input_url || job.input_url);
  const shouldRunOcr = !payload.asset?.ocr_checked_at;
  const ocrText = shouldRunOcr
    ? await extractTextFromImageBuffer(source)
    : (payload.asset?.ocr_text || null);
  const referenceItems = Array.isArray(payload.reference_items) ? payload.reference_items : [];
  const shouldComputeHash =
    payload.should_compute_hash ||
    referenceItems.some((item) => typeof item?.imageHash === "string" && item.imageHash.length > 0);
  const imageHash = shouldComputeHash ? await computeAverageHash(source) : null;
  const result = detector.runInfringementDetection({
    asset: {
      copyright_status: payload.asset?.copyright_status || "unknown",
      filename: payload.asset?.filename || job.asset?.filename || "image",
      id: payload.asset?.id || job.asset?.id || job.asset_id,
      image_hash: imageHash,
      original_url: payload.asset?.original_url || payload.input_url || job.input_url,
      source: payload.asset?.source || "upload",
    },
    ocrText,
    productTexts: Array.isArray(payload.product_texts) ? payload.product_texts : [],
    referenceItems,
  });

  return {
    infringement: {
      image_hash: imageHash,
      ocr_attempted: shouldRunOcr && ocrText !== null,
      ocr_text: ocrText,
      result,
    },
  };
}

async function fetchExportImagesZipPayload(job) {
  const recordId = getExportRecordId(job);
  if (!recordId) {
    throw new Error("export_images_zip job is missing record_id");
  }

  const data = await apiFetch(`/api/local-worker/exports/${encodeURIComponent(recordId)}/payload`, {
    method: "GET",
  });

  if (!data.payload) {
    throw new Error("export_images_zip payload is missing");
  }

  return data.payload;
}

async function processExportImagesZip(job) {
  const payload = await fetchExportImagesZipPayload(job);
  const products = Array.isArray(payload.products) ? payload.products : [];

  if (products.length === 0) {
    throw new Error("export_images_zip payload has no products");
  }

  const zip = new JSZip();
  const folderCounts = new Map();

  for (const product of products) {
    const productId = typeof product.id === "string" ? product.id : "product";
    const skuFolder = sanitizeZipSegment(product.sku, productId);
    const currentCount = (folderCounts.get(skuFolder) ?? 0) + 1;
    folderCounts.set(skuFolder, currentCount);

    const folderName = currentCount === 1 ? skuFolder : `${skuFolder}-${currentCount}`;
    const folder = zip.folder(folderName);
    if (!folder) {
      throw new Error(`Failed to create ZIP folder: ${folderName}`);
    }

    const imageUrls = Array.isArray(product.image_urls)
      ? product.image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
      : [];

    if (imageUrls.length === 0) {
      throw new Error(`Product ${product.sku || productId} has no exportable images`);
    }

    for (const [index, imageUrl] of imageUrls.entries()) {
      const buffer = await readImageBuffer(imageUrl);
      const imageName = `${String(index + 1).padStart(2, "0")}${inferImageExtensionFromUrl(imageUrl)}`;
      folder.file(imageName, buffer);
    }
  }

  const filename =
    typeof payload.filename === "string" && payload.filename.endsWith(".zip")
      ? payload.filename
      : "product-images.zip";
  const archive = await zip.generateAsync({
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    type: "nodebuffer",
  });

  return {
    files: {
      archive: {
        buffer: archive,
        contentType: "application/zip",
        filename,
      },
    },
  };
}

async function processAiGenerateImage(job) {
  const jobId = job.job_id || job.item_id;
  if (!jobId) {
    throw new Error("ai_generate_image job is missing job_id");
  }

  const worker = getAiImageWorker();
  const supabase = worker.createSupabaseServiceRoleClient();
  const result = await worker.executeAiGenerateImageJob(supabase, jobId);

  return {
    ai_image: result,
  };
}

async function processAiSplitGrid(job) {
  const jobId = job.job_id || job.item_id;
  if (!jobId) {
    throw new Error("ai_split_grid job is missing job_id");
  }

  const worker = getAiSplitGridWorker();
  const supabase = worker.createSupabaseServiceRoleClient();
  const result = await worker.executeAiSplitGridJob(supabase, jobId);

  return {
    ai_split_grid: result,
  };
}

async function processAiApplyPattern(job) {
  const jobId = job.job_id || job.item_id;
  if (!jobId) {
    throw new Error("ai_apply_pattern job is missing job_id");
  }

  const worker = getAiApplyPatternWorker();
  const supabase = worker.createSupabaseServiceRoleClient();
  const result = await worker.executeAiApplyPatternJob(supabase, jobId);

  return {
    ai_apply_pattern: result,
  };
}

function appendFile(form, name, file) {
  if (!file) return;
  const bytes = file.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);
  form.append(name, new Blob([bytes], { type: file.contentType }), file.filename);
}

async function apiFetch(pathname, options = {}) {
  if (!SECRET) {
    throw new Error("LOCAL_WORKER_SECRET or WORKER_SECRET is required");
  }

  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function claimJob(jobType) {
  if (IMAGE_JOB_TYPES.has(jobType)) {
    const data = await apiFetch("/api/local-worker/jobs/claim", {
      body: JSON.stringify({ job_types: [jobType] }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (data.job) {
      return data.job;
    }
  }

  if (jobType === ASSET_DELETE_JOB_TYPE) {
    const deleteData = await apiFetch("/api/local-worker/asset-delete/claim", {
      method: "POST",
    });

    if (deleteData.job) {
      return deleteData.job;
    }
  }

  if (jobType === COLLECTOR_OPERATION_JOB_TYPE) {
    const collectorData = await apiFetch("/api/local-worker/collector-operations/claim", {
      method: "POST",
    });

    if (collectorData.job) {
      return collectorData.job;
    }
  }

  if (jobType === EXPORT_IMAGES_ZIP_JOB_TYPE) {
    const exportData = await apiFetch("/api/local-worker/exports/claim", {
      method: "POST",
    });

    if (exportData.job) {
      return exportData.job;
    }
  }

  if (jobType === AI_SPLIT_GRID_JOB_TYPE) {
    const splitData = await apiFetch("/api/local-worker/ai-split-grid/claim", {
      method: "POST",
    });

    if (splitData.job) {
      return splitData.job;
    }
  }

  if (jobType === AI_APPLY_PATTERN_JOB_TYPE) {
    const applyData = await apiFetch("/api/local-worker/ai-apply-pattern/claim", {
      method: "POST",
    });

    if (applyData.job) {
      return applyData.job;
    }
  }

  if (jobType === AI_GENERATE_IMAGE_JOB_TYPE) {
    const aiData = await apiFetch("/api/local-worker/ai-images/claim", {
      method: "POST",
    });

    return aiData.job || null;
  }

  return null;
}

async function claimNextJob(workerId) {
  const candidates = rotatedJobTypes(claimableJobTypes());
  if (candidates.length === 0) {
    return null;
  }

  for (const jobType of candidates) {
    setWorkerSlot(workerId, {
      asset_id: null,
      asset_filename: null,
      duration_ms: null,
      item_id: null,
      job_id: null,
      job_type: jobType,
      last_error: null,
      stage: "claiming",
      started_at: null,
      status: "claiming",
    });

    const job = await claimJob(jobType);
    if (job) {
      return job;
    }
  }

  return null;
}

async function completeJob(job, result) {
  if (job.job_type === ASSET_DELETE_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/asset-delete/${encodeURIComponent(jobId)}/complete`, {
      method: "POST",
    });
  }

  if (job.job_type === COLLECTOR_OPERATION_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/collector-operations/${encodeURIComponent(jobId)}/complete`, {
      method: "POST",
    });
  }

  if (job.job_type === AI_SPLIT_GRID_JOB_TYPE) {
    return result.ai_split_grid;
  }

  if (job.job_type === AI_APPLY_PATTERN_JOB_TYPE) {
    return result.ai_apply_pattern;
  }

  if (job.job_type === AI_GENERATE_IMAGE_JOB_TYPE) {
    return result.ai_image;
  }

  if (job.job_type === EXPORT_IMAGES_ZIP_JOB_TYPE) {
    const recordId = getExportRecordId(job);
    const form = new FormData();
    appendFile(form, "archive", result.files.archive);

    return apiFetch(`/api/local-worker/exports/${encodeURIComponent(recordId)}/complete`, {
      body: form,
      method: "POST",
    });
  }

  if (job.job_type === "infringement_check") {
    return apiFetch(`/api/local-worker/jobs/${encodeURIComponent(job.item_id)}/complete`, {
      body: JSON.stringify({
        infringement: result.infringement,
        kind: "infringement_check",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  const form = new FormData();

  if (job.job_type === "mockup") {
    for (const output of result.files.outputs || []) {
      appendFile(form, "outputs", output);
    }

    return apiFetch(`/api/local-worker/jobs/${encodeURIComponent(job.item_id)}/complete`, {
      body: form,
      method: "POST",
    });
  }

  form.append("bbox", JSON.stringify(result.bbox || {}));
  form.append("metrics", JSON.stringify(result.metrics || {}));
  form.append("width", String(Math.round(result.width || 0)));
  form.append("height", String(Math.round(result.height || 0)));
  appendFile(form, "output", result.files.output);
  appendFile(form, "preview", result.files.preview);
  appendFile(form, "mask", result.files.mask);
  appendFile(form, "raw", result.files.raw);

  return apiFetch(`/api/local-worker/jobs/${encodeURIComponent(job.item_id)}/complete`, {
    body: form,
    method: "POST",
  });
}

async function failJob(job, error) {
  if (job.job_type === ASSET_DELETE_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/asset-delete/${encodeURIComponent(jobId)}/fail`, {
      body: JSON.stringify({ error: getErrorMessage(error) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  if (job.job_type === COLLECTOR_OPERATION_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/collector-operations/${encodeURIComponent(jobId)}/fail`, {
      body: JSON.stringify({ error: getErrorMessage(error) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  if (job.job_type === AI_SPLIT_GRID_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/ai-split-grid/${encodeURIComponent(jobId)}/fail`, {
      body: JSON.stringify({ error: getErrorMessage(error) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  if (job.job_type === AI_APPLY_PATTERN_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/ai-apply-pattern/${encodeURIComponent(jobId)}/fail`, {
      body: JSON.stringify({ error: getErrorMessage(error) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  if (job.job_type === AI_GENERATE_IMAGE_JOB_TYPE) {
    const jobId = job.job_id || job.item_id;
    return apiFetch(`/api/local-worker/ai-images/${encodeURIComponent(jobId)}/fail`, {
      body: JSON.stringify({ error: getErrorMessage(error) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  if (job.job_type === EXPORT_IMAGES_ZIP_JOB_TYPE) {
    const recordId = getExportRecordId(job);
    return apiFetch(`/api/local-worker/exports/${encodeURIComponent(recordId)}/fail`, {
      body: JSON.stringify({ error: getErrorMessage(error) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  }

  return apiFetch(`/api/local-worker/jobs/${encodeURIComponent(job.item_id)}/fail`, {
    body: JSON.stringify({ error: getErrorMessage(error) }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function processJob(job) {
  if (job.job_type === ASSET_DELETE_JOB_TYPE) {
    return {
      asset_delete: {
        job_id: job.job_id || job.item_id,
      },
    };
  }

  if (job.job_type === COLLECTOR_OPERATION_JOB_TYPE) {
    return {
      collector_operation: {
        job_id: job.job_id || job.item_id,
      },
    };
  }

  if (job.job_type === AI_SPLIT_GRID_JOB_TYPE) {
    return processAiSplitGrid(job);
  }

  if (job.job_type === AI_APPLY_PATTERN_JOB_TYPE) {
    return processAiApplyPattern(job);
  }

  if (job.job_type === AI_GENERATE_IMAGE_JOB_TYPE) {
    return processAiGenerateImage(job);
  }

  if (job.job_type === EXPORT_IMAGES_ZIP_JOB_TYPE) {
    return processExportImagesZip(job);
  }
  if (job.job_type === "resize") {
    return processResize(job);
  }
  if (job.job_type === "fission") {
    return processFission(job);
  }
  if (job.job_type === "cutout") {
    return processCutout(job);
  }
  if (job.job_type === "print_extraction") {
    return processPrintExtraction(job);
  }
  if (job.job_type === "mockup") {
    return processMockup(job);
  }
  if (job.job_type === "infringement_check") {
    return processInfringementCheck(job);
  }
  throw new Error(`Unsupported job type: ${job.job_type}`);
}

async function workerLoop(workerId) {
  let lastIdleLog = 0;
  setWorkerIdle(workerId);

  while (!stopping) {
    let job = null;

    try {
      job = await claimNextJob(workerId);
      if (!job) {
        setWorkerIdle(workerId);
        const now = Date.now();
        if (now - lastIdleLog >= IDLE_LOG_MS) {
          console.log(`[worker:${workerId}] idle`);
          lastIdleLog = now;
        }
        await sleep(POLL_MS);
        continue;
      }

      console.log(`[worker:${workerId}] claimed ${job.job_type} item=${job.item_id} asset=${job.asset?.filename || job.asset_id || ""}`);
      const startedAt = Date.now();
      setWorkerSlot(workerId, {
        asset_id: job.asset?.id || job.asset_id || null,
        asset_filename: job.asset?.filename || null,
        duration_ms: null,
        item_id: job.item_id,
        job_id: job.job_id,
        job_type: job.job_type,
        last_error: null,
        stage: "processing",
        started_at: new Date(startedAt).toISOString(),
        status: "processing",
      });
      const result = await processJob(job);
      setWorkerSlot(workerId, {
        stage: "saving",
        status: "processing",
      });
      await completeJob(job, result);
      setWorkerSlot(workerId, {
        duration_ms: Date.now() - startedAt,
        last_error: null,
        stage: "completed",
        status: "completed",
      });
      console.log(`[worker:${workerId}] completed item=${job.item_id} in ${Date.now() - startedAt}ms`);
    } catch (error) {
      console.error(`[worker:${workerId}] ${getErrorMessage(error)}`);
      setWorkerSlot(workerId, {
        last_error: getErrorMessage(error),
        stage: job ? "failed" : "claim_failed",
        status: "failed",
      });
      if (job) {
        try {
          await failJob(job, error);
        } catch (failError) {
          console.error(`[worker:${workerId}] fail callback error: ${getErrorMessage(failError)}`);
        }
      } else {
        await sleep(POLL_MS);
      }
    }
  }
}

async function main() {
  if (!SECRET) {
    console.error("LOCAL_WORKER_SECRET or WORKER_SECRET is required");
    process.exitCode = 1;
    return;
  }

  console.log(
    `[local-image-worker] base=${BASE_URL} concurrency=${CONCURRENCY} assets=${LOCAL_ASSETS_DIR} jobTypes=${JOB_TYPES.join(",")}`,
  );
  console.log(`[local-image-worker] typeLimits=${formatJobTypeLimits()}`);
  console.log(`[local-image-worker] state=${WORKER_STATE_FILE}`);

  for (let workerId = 1; workerId <= CONCURRENCY; workerId += 1) {
    setWorkerIdle(workerId);
  }
  const heartbeatTimer = setInterval(() => queueWorkerStateWrite("heartbeat"), HEARTBEAT_MS);
  heartbeatTimer.unref?.();
  queueWorkerStateWrite("startup");
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => workerLoop(index + 1)));
  clearInterval(heartbeatTimer);
  queueWorkerStateWrite("stopped");
  await stateWriteQueue;
  console.log("[local-image-worker] stopped");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  });
}
