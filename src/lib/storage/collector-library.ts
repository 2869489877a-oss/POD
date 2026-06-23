import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";
import { resolveLocalDataPath } from "@/lib/storage/local-data";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const COLLECTOR_LIBRARY_DIR = "collector-library";

const DEFAULT_PUBLIC_PATH = "/uploads/collector";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export type CollectorLibraryItem = {
  createdAt: string;
  date: string;
  employeeName: string;
  fileSize: number;
  filename: string;
  format: string | null;
  height: number | null;
  pageUrl: string | null;
  publicUrl: string;
  relativePath: string;
  siteType: string;
  sourceUrl: string | null;
  updatedAt: string;
  uploadDate: string;
  width: number | null;
};

export type CollectorOperationResult = {
  asset_id?: string;
  error?: string;
  filename?: string;
  original_url?: string;
  public_url?: string;
  relative_path: string;
  success: boolean;
};

type SaveCollectorFileInput = {
  employeeName?: string | null;
  file: File;
  pageUrl?: string | null;
  request?: Request;
  siteType?: string | null;
  sourceUrl?: string | null;
};

type ListCollectorItemsInput = {
  endDate?: string;
  limit?: number;
  request?: Request;
  startDate?: string;
};

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getForwardedOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();

  if (!host) {
    return new URL(request.url).origin;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "") || "http";
  return proto + "://" + host;
}

function encodeRelativePath(relativePath: string) {
  return relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function normalizeRelativePath(relativePath: string) {
  if (relativePath.includes("\0")) {
    throw new Error("Invalid collector path");
  }

  const parts = relativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === ".." || path.isAbsolute(part))) {
    throw new Error("Invalid collector path");
  }

  return parts.join("/");
}

function sanitizeSegment(value: string | null | undefined, fallback: string) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u0000-\u001f]+/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60);

  return normalized || fallback;
}

function sanitizeFilename(filename: string) {
  const parsed = path.parse(filename.replaceAll("\\", "/"));
  const name = sanitizeSegment(parsed.name || "image", "image").slice(0, 90);
  return name || "image";
}

function extensionForFormat(format: string | undefined) {
  if (format === "jpeg") return ".jpg";
  if (format === "png" || format === "webp") return "." + format;
  return ".jpg";
}

function metadataPathForDiskPath(diskPath: string) {
  return diskPath + ".json";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function beijingDatePath(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return year + "-" + month + "-" + day;
}

function normalizeDateKey(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
}

export function getCollectorLibraryRoot() {
  return resolveLocalDataPath(COLLECTOR_LIBRARY_DIR);
}

export function resolveCollectorLibraryPath(relativePath: string) {
  return resolveLocalDataPath(COLLECTOR_LIBRARY_DIR + "/" + normalizeRelativePath(relativePath));
}

export function getCollectorLibraryPublicBaseUrl(request?: Request) {
  const configuredBase = process.env.COLLECTOR_LIBRARY_PUBLIC_URL_BASE?.trim();

  if (configuredBase) {
    return stripTrailingSlash(configuredBase);
  }

  if (request) {
    return getForwardedOrigin(request) + DEFAULT_PUBLIC_PATH;
  }

  return DEFAULT_PUBLIC_PATH;
}

export function buildCollectorLibraryPublicUrl(relativePath: string, request?: Request) {
  return getCollectorLibraryPublicBaseUrl(request) + "/" + encodeRelativePath(relativePath);
}

async function readMetadata(relativePath: string): Promise<Partial<CollectorLibraryItem>> {
  try {
    const raw = await readFile(metadataPathForDiskPath(resolveCollectorLibraryPath(relativePath)), "utf8");
    const parsed = JSON.parse(raw) as Partial<CollectorLibraryItem>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function itemFromRelativePath(relativePath: string, request?: Request): Promise<CollectorLibraryItem | null> {
  const diskPath = resolveCollectorLibraryPath(relativePath);
  const fileStat = await stat(diskPath);

  if (!fileStat.isFile()) {
    return null;
  }

  const metadata = await readMetadata(relativePath);
  const parts = relativePath.split("/");
  const createdAt = metadata.createdAt || fileStat.birthtime.toISOString();
  const uploadDate = metadata.uploadDate || metadata.date || parts[1] || beijingDatePath(new Date(createdAt));

  return {
    createdAt,
    date: uploadDate,
    employeeName: metadata.employeeName || parts[0] || "未分类",
    fileSize: metadata.fileSize || fileStat.size,
    filename: metadata.filename || path.basename(relativePath),
    format: metadata.format || null,
    height: metadata.height || null,
    pageUrl: metadata.pageUrl || null,
    publicUrl: buildCollectorLibraryPublicUrl(relativePath, request),
    relativePath,
    siteType: metadata.siteType || parts[2] || "generic",
    sourceUrl: metadata.sourceUrl || null,
    updatedAt: fileStat.mtime.toISOString(),
    uploadDate,
    width: metadata.width || null,
  };
}

async function walkCollectorFiles(directory: string, prefix = "", output: string[] = []) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return output;
    throw error;
  }

  for (const entry of entries) {
    const relativePath = prefix ? prefix + "/" + entry.name : entry.name;
    const diskPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walkCollectorFiles(diskPath, relativePath, output);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".json")) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    output.push(relativePath.replaceAll("\\", "/"));
  }

  return output;
}

export async function listCollectorItems({ endDate, limit = 2000, request, startDate }: ListCollectorItemsInput = {}) {
  const root = getCollectorLibraryRoot();
  const relativePaths = await walkCollectorFiles(root);
  const items: CollectorLibraryItem[] = [];
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedEndDate = normalizeDateKey(endDate);

  for (const relativePath of relativePaths) {
    const item = await itemFromRelativePath(relativePath, request);
    if (!item) continue;
    if (normalizedStartDate && item.uploadDate < normalizedStartDate) continue;
    if (normalizedEndDate && item.uploadDate > normalizedEndDate) continue;
    if (item) items.push(item);
  }

  return items
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 5000)));
}

export async function saveCollectorFile({
  employeeName,
  file,
  pageUrl,
  request,
  siteType,
  sourceUrl,
}: SaveCollectorFileInput) {
  if (file.size <= 0) {
    throw new Error("Empty image file");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds the 25MB limit");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unable to read image dimensions or format");
  }

  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error("Unsupported image format: " + metadata.format);
  }

  const employee = sanitizeSegment(employeeName, "未分类");
  const site = sanitizeSegment(siteType, "generic").toLowerCase();
  const date = beijingDatePath();
  const filename = randomUUID() + "-" + sanitizeFilename(file.name || "image") + extensionForFormat(metadata.format);
  const relativePath = [employee, date, site, filename].join("/");
  const diskPath = resolveCollectorLibraryPath(relativePath);

  await mkdir(path.dirname(diskPath), { recursive: true });
  await writeFile(diskPath, buffer, { flag: "wx" });

  const item: CollectorLibraryItem = {
    createdAt: new Date().toISOString(),
    date,
    employeeName: employee,
    fileSize: file.size,
    filename,
    format: metadata.format,
    height: metadata.height,
    pageUrl: pageUrl || null,
    publicUrl: buildCollectorLibraryPublicUrl(relativePath, request),
    relativePath,
    siteType: site,
    sourceUrl: sourceUrl || null,
    updatedAt: new Date().toISOString(),
    uploadDate: date,
    width: metadata.width,
  };

  try {
    await writeFile(metadataPathForDiskPath(diskPath), JSON.stringify(item, null, 2), "utf8");
  } catch (error) {
    await rm(diskPath, { force: true });
    throw error;
  }

  return item;
}

export function parseCollectorRelativePaths(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .map((item) => normalizeRelativePath(item)),
    ),
  );
}

export async function deleteCollectorItems(relativePaths: string[]): Promise<CollectorOperationResult[]> {
  const results: CollectorOperationResult[] = [];

  for (const relativePath of relativePaths) {
    try {
      const diskPath = resolveCollectorLibraryPath(relativePath);
      const item = await itemFromRelativePath(relativePath);
      await rm(diskPath, { force: true });
      await rm(metadataPathForDiskPath(diskPath), { force: true });
      results.push({
        filename: item?.filename || path.basename(relativePath),
        relative_path: relativePath,
        success: true,
      });
    } catch (error) {
      results.push({
        error: getErrorMessage(error),
        relative_path: relativePath,
        success: false,
      });
    }
  }

  return results;
}

export async function promoteCollectorItems(relativePaths: string[], request?: Request): Promise<CollectorOperationResult[]> {
  const supabase = createSupabaseServiceRoleClient();
  const results: CollectorOperationResult[] = [];

  for (const relativePath of relativePaths) {
    let originalUrl: string | null = null;

    try {
      const diskPath = resolveCollectorLibraryPath(relativePath);
      const fileStat = await stat(diskPath);
      const filename = path.basename(relativePath);
      const buffer = await readFile(diskPath);
      const metadata = await sharp(buffer).metadata();

      if (!metadata.width || !metadata.height || !metadata.format) {
        throw new Error("Unable to read image dimensions or format");
      }

      if (!ALLOWED_FORMATS.has(metadata.format)) {
        throw new Error("Unsupported image format: " + metadata.format);
      }

      const assetRelativePath =
        beijingDatePath() + "/" + randomUUID() + "-" + sanitizeFilename(filename) + extensionForFormat(metadata.format);
      const savedAsset = await saveLocalAssetAtPath({
        buffer,
        relativePath: assetRelativePath,
        request,
      });
      originalUrl = savedAsset.publicUrl;

      const { data, error } = await supabase
        .from("assets")
        .insert({
          copyright_status: "unknown",
          file_size: fileStat.size,
          filename,
          format: metadata.format,
          height: metadata.height,
          original_url: originalUrl,
          source: "link",
          status: "uploaded",
          width: metadata.width,
        })
        .select("id")
        .single();

      if (error) {
        await deleteLocalAssetByPublicUrl(originalUrl);
        throw new Error(error.message);
      }

      await rm(diskPath, { force: true });
      await rm(metadataPathForDiskPath(diskPath), { force: true });

      results.push({
        asset_id: data.id,
        filename,
        original_url: originalUrl,
        relative_path: relativePath,
        success: true,
      });
    } catch (error) {
      if (originalUrl) {
        await deleteLocalAssetByPublicUrl(originalUrl);
      }

      results.push({
        error: getErrorMessage(error),
        relative_path: relativePath,
        success: false,
      });
    }
  }

  return results;
}
