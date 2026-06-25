import "server-only";

import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { computeAverageHash } from "@/lib/infringement/image-hash";
import { deleteLocalAssetByPublicUrl, saveLocalAssetAtPath } from "@/lib/storage/local-assets";
import { resolveLocalDataPath } from "@/lib/storage/local-data";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const COLLECTOR_LIBRARY_DIR = "collector-library";

const DEFAULT_PUBLIC_PATH = "/uploads/collector";
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const COLLECTOR_MUTATION_CONCURRENCY = 5;
const COLLECTOR_INDEX_FILENAME = ".collector-index.json";
const COLLECTOR_INDEX_VERSION = 1;
const RISK_LIBRARY_BATCH_SIZE = 100;
const RISK_LIBRARY_PREPARE_CONCURRENCY = 8;

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
  image_hash?: string;
  original_url?: string;
  public_url?: string;
  reference_id?: string;
  relative_path: string;
  status?: "added" | "deleted" | "promoted" | "skipped";
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
  forceRebuildIndex?: boolean;
  limit?: number;
  offset?: number;
  request?: Request;
  startDate?: string;
};

type CollectorLibraryIndex = {
  items: CollectorLibraryItem[];
  updatedAt: string;
  version: number;
};

type RiskLibraryCandidate = {
  filename: string;
  imageHash: string;
  item: CollectorLibraryItem | null;
  metadata: Record<string, unknown>;
  publicUrl: string;
  relativePath: string;
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

function uploadDateFromRelativePath(relativePath: string) {
  return relativePath.split("/").find((part) => /^\d{4}-\d{2}-\d{2}$/.test(part)) || "";
}

export function getCollectorLibraryRoot() {
  return resolveLocalDataPath(COLLECTOR_LIBRARY_DIR);
}

function getCollectorIndexPath() {
  return path.join(getCollectorLibraryRoot(), COLLECTOR_INDEX_FILENAME);
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

function itemFromMetadata(
  relativePath: string,
  metadata: Partial<CollectorLibraryItem>,
  fileStat: Stats,
  request?: Request,
): CollectorLibraryItem {
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

async function itemFromRelativePath(relativePath: string, request?: Request): Promise<CollectorLibraryItem | null> {
  const diskPath = resolveCollectorLibraryPath(relativePath);
  const fileStat = await stat(diskPath);

  if (!fileStat.isFile()) {
    return null;
  }

  const metadata = await readMetadata(relativePath);
  return itemFromMetadata(relativePath, metadata, fileStat, request);
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

function normalizeIndexedItem(item: CollectorLibraryItem, request?: Request): CollectorLibraryItem {
  const uploadDate = item.uploadDate || item.date || uploadDateFromRelativePath(item.relativePath) || beijingDatePath(new Date(item.createdAt));

  return {
    ...item,
    date: uploadDate,
    filename: item.filename || path.basename(item.relativePath),
    publicUrl: buildCollectorLibraryPublicUrl(item.relativePath, request),
    uploadDate,
  };
}

function isIndexedCollectorItem(value: unknown): value is CollectorLibraryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CollectorLibraryItem>;
  return typeof item.relativePath === "string" && item.relativePath.length > 0 && typeof item.filename === "string";
}

async function readCollectorIndex(request?: Request): Promise<CollectorLibraryItem[] | null> {
  try {
    const raw = await readFile(getCollectorIndexPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CollectorLibraryIndex>;

    if (parsed.version !== COLLECTOR_INDEX_VERSION || !Array.isArray(parsed.items)) {
      return null;
    }

    return parsed.items
      .filter(isIndexedCollectorItem)
      .map((item) => normalizeIndexedItem(item, request));
  } catch {
    return null;
  }
}

async function writeCollectorIndex(items: CollectorLibraryItem[]) {
  const root = getCollectorLibraryRoot();
  const indexPath = getCollectorIndexPath();
  const tmpPath = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
  const uniqueItems = Array.from(
    new Map(items.map((item) => [item.relativePath, normalizeIndexedItem(item)])).values(),
  );
  const payload: CollectorLibraryIndex = {
    items: uniqueItems,
    updatedAt: new Date().toISOString(),
    version: COLLECTOR_INDEX_VERSION,
  };

  await mkdir(root, { recursive: true });
  await writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tmpPath, indexPath);
}

async function rebuildCollectorIndex(request?: Request) {
  const root = getCollectorLibraryRoot();
  const relativePaths = await walkCollectorFiles(root);
  const items: CollectorLibraryItem[] = [];

  for (const relativePath of relativePaths) {
    const item = await itemFromRelativePath(relativePath, request);
    if (item) items.push(item);
  }

  await writeCollectorIndex(items);
  return items.map((item) => normalizeIndexedItem(item, request));
}

async function getCollectorIndexedItems(request?: Request, forceRebuildIndex = false) {
  if (!forceRebuildIndex) {
    const indexed = await readCollectorIndex(request);
    if (indexed) return indexed;
  }

  return rebuildCollectorIndex(request);
}

async function updateCollectorIndex(mutator: (items: CollectorLibraryItem[]) => CollectorLibraryItem[]) {
  const indexed = await readCollectorIndex();
  if (!indexed) return;
  await writeCollectorIndex(mutator(indexed));
}

async function addCollectorItemToIndex(item: CollectorLibraryItem) {
  await updateCollectorIndex((items) => [normalizeIndexedItem(item), ...items.filter((current) => current.relativePath !== item.relativePath)]);
}

async function removeCollectorPathsFromIndex(relativePaths: string[]) {
  const removeSet = new Set(relativePaths);
  await updateCollectorIndex((items) => items.filter((item) => !removeSet.has(item.relativePath)));
}

export async function listCollectorItemsPage({
  endDate,
  forceRebuildIndex = false,
  limit = 120,
  offset = 0,
  request,
  startDate,
}: ListCollectorItemsInput = {}) {
  const indexedItems = await getCollectorIndexedItems(request, forceRebuildIndex);
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedEndDate = normalizeDateKey(endDate);
  const dateCounts = new Map<string, number>();
  const filteredItems = indexedItems.filter((item) => {
    const uploadDate = item.uploadDate || item.date || uploadDateFromRelativePath(item.relativePath);

    if (uploadDate) {
      dateCounts.set(uploadDate, (dateCounts.get(uploadDate) || 0) + 1);
    }

    if (normalizedStartDate && uploadDate && uploadDate < normalizedStartDate) return false;
    if (normalizedEndDate && uploadDate && uploadDate > normalizedEndDate) return false;
    return true;
  });
  const sortedItems = filteredItems.sort((a, b) => {
    const aDate = a.uploadDate || a.date || uploadDateFromRelativePath(a.relativePath);
    const bDate = b.uploadDate || b.date || uploadDateFromRelativePath(b.relativePath);
    const dateCompare = bDate.localeCompare(aDate);
    return dateCompare !== 0 ? dateCompare : b.relativePath.localeCompare(a.relativePath);
  });
  const safeLimit = Math.max(1, Math.min(limit, 240));
  const safeOffset = Math.max(0, offset);
  const items = sortedItems.slice(safeOffset, safeOffset + safeLimit);

  return {
    dateBuckets: Array.from(dateCounts.entries())
      .map(([date, count]) => ({ count, date }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    items: items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    limit: safeLimit,
    offset: safeOffset,
    total: filteredItems.length,
  };
}

export async function listCollectorRelativePathsPage({
  endDate,
  forceRebuildIndex = false,
  limit = 10000,
  offset = 0,
  startDate,
}: ListCollectorItemsInput = {}) {
  const indexedItems = await getCollectorIndexedItems(undefined, forceRebuildIndex);
  const normalizedStartDate = normalizeDateKey(startDate);
  const normalizedEndDate = normalizeDateKey(endDate);
  const dateCounts = new Map<string, number>();
  const filteredItems = indexedItems.filter((item) => {
    const uploadDate = item.uploadDate || item.date || uploadDateFromRelativePath(item.relativePath);

    if (uploadDate) {
      dateCounts.set(uploadDate, (dateCounts.get(uploadDate) || 0) + 1);
    }

    if (normalizedStartDate && uploadDate && uploadDate < normalizedStartDate) return false;
    if (normalizedEndDate && uploadDate && uploadDate > normalizedEndDate) return false;
    return true;
  });
  const sortedItems = filteredItems.sort((a, b) => {
    const aDate = a.uploadDate || a.date || uploadDateFromRelativePath(a.relativePath);
    const bDate = b.uploadDate || b.date || uploadDateFromRelativePath(b.relativePath);
    const dateCompare = bDate.localeCompare(aDate);
    return dateCompare !== 0 ? dateCompare : b.relativePath.localeCompare(a.relativePath);
  });
  const safeLimit = Math.max(1, Math.min(limit, 20000));
  const safeOffset = Math.max(0, offset);

  return {
    dateBuckets: Array.from(dateCounts.entries())
      .map(([date, count]) => ({ count, date }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    limit: safeLimit,
    offset: safeOffset,
    relativePaths: sortedItems.slice(safeOffset, safeOffset + safeLimit).map((item) => item.relativePath),
    total: filteredItems.length,
  };
}

export async function listCollectorItems(input: ListCollectorItemsInput = {}) {
  const page = await listCollectorItemsPage(input);
  return page.items;
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

  await addCollectorItemToIndex(item);

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
  const results = await mapWithConcurrency(relativePaths, COLLECTOR_MUTATION_CONCURRENCY, async (relativePath) => {
    try {
      const diskPath = resolveCollectorLibraryPath(relativePath);
      const item = await itemFromRelativePath(relativePath);
      await rm(diskPath, { force: true });
      await rm(metadataPathForDiskPath(diskPath), { force: true });
      return {
        filename: item?.filename || path.basename(relativePath),
        relative_path: relativePath,
        success: true,
      };
    } catch (error) {
      return {
        error: getErrorMessage(error),
        relative_path: relativePath,
        success: false,
      };
    }
  });
  await removeCollectorPathsFromIndex(results.filter((result) => result.success).map((result) => result.relative_path));
  return results;
}

export async function promoteCollectorItems(relativePaths: string[], request?: Request): Promise<CollectorOperationResult[]> {
  const supabase = createSupabaseServiceRoleClient();

  const results = await mapWithConcurrency(relativePaths, COLLECTOR_MUTATION_CONCURRENCY, async (relativePath) => {
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

      return {
        asset_id: data.id,
        filename,
        original_url: originalUrl,
        relative_path: relativePath,
        success: true,
      };
    } catch (error) {
      if (originalUrl) {
        await deleteLocalAssetByPublicUrl(originalUrl);
      }

      return {
        error: getErrorMessage(error),
        relative_path: relativePath,
        success: false,
      };
    }
  });
  await removeCollectorPathsFromIndex(results.filter((result) => result.success).map((result) => result.relative_path));
  return results;
}

function stringMetadataValue(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function referenceTitleForItem(item: CollectorLibraryItem | null, metadata: Record<string, unknown>, relativePath: string) {
  const label = stringMetadataValue(metadata, "label");
  const filename = item?.filename || path.basename(relativePath);
  const title = label ? label + " / " + filename : filename;
  return title.slice(0, 180);
}

function referenceTermsForItem(metadata: Record<string, unknown>) {
  const terms = [
    stringMetadataValue(metadata, "label"),
    stringMetadataValue(metadata, "brand"),
    stringMetadataValue(metadata, "keyword"),
  ].filter((term) => term.length >= 2 && term.length <= 80);

  return Array.from(new Set(terms));
}

function isAverageHash(value: string) {
  return /^[a-f0-9]{16}$/i.test(value);
}

function getStoredImageHash(metadata: Record<string, unknown>) {
  const camelHash = stringMetadataValue(metadata, "imageHash");
  if (isAverageHash(camelHash)) return camelHash.toLowerCase();

  const snakeHash = stringMetadataValue(metadata, "image_hash");
  return isAverageHash(snakeHash) ? snakeHash.toLowerCase() : "";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function prepareRiskLibraryCandidate(relativePath: string, request?: Request): Promise<RiskLibraryCandidate> {
  const diskPath = resolveCollectorLibraryPath(relativePath);
  const storedMetadata = await readMetadata(relativePath);
  const fileStat = await stat(diskPath);

  if (!fileStat.isFile()) {
    throw new Error("Collector path is not a file");
  }

  const metadataRecord = storedMetadata as Record<string, unknown>;
  const item = itemFromMetadata(relativePath, storedMetadata, fileStat, request);
  let imageHash = getStoredImageHash(metadataRecord);

  if (!imageHash) {
    const buffer = await readFile(diskPath);
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new Error("Unable to read image dimensions or format");
    }

    if (!ALLOWED_FORMATS.has(metadata.format)) {
      throw new Error("Unsupported image format: " + metadata.format);
    }

    imageHash = await computeAverageHash(buffer);
  }

  return {
    filename: item?.filename || path.basename(relativePath),
    imageHash,
    item,
    metadata: metadataRecord,
    publicUrl: item?.publicUrl || buildCollectorLibraryPublicUrl(relativePath, request),
    relativePath,
  };
}

function riskLibrarySuccessResult(
  candidate: RiskLibraryCandidate,
  status: "added" | "skipped",
  referenceId?: string,
): CollectorOperationResult {
  return {
    filename: candidate.filename,
    image_hash: candidate.imageHash,
    public_url: candidate.publicUrl,
    reference_id: referenceId,
    relative_path: candidate.relativePath,
    status,
    success: true,
  };
}

function riskLibraryInsertRow(candidate: RiskLibraryCandidate) {
  return {
    category: "visual_review",
    description: "Collector library image marked as a high-risk visual reference.",
    image_hash: candidate.imageHash,
    image_url: candidate.publicUrl,
    is_active: true,
    library_type: "high_risk",
    notes: "auto:collector-risk-library path=" + candidate.relativePath,
    risk_level: "high",
    severity: "high",
    source_label: stringMetadataValue(candidate.metadata, "dataset") || candidate.item?.siteType || "collector-library",
    source_url:
      candidate.item?.sourceUrl ||
      candidate.item?.pageUrl ||
      stringMetadataValue(candidate.metadata, "sourceUrl") ||
      candidate.publicUrl,
    terms: referenceTermsForItem(candidate.metadata),
    title: referenceTitleForItem(candidate.item, candidate.metadata, candidate.relativePath),
  };
}

export async function addCollectorItemsToRiskLibrary(
  relativePaths: string[],
  request?: Request,
): Promise<CollectorOperationResult[]> {
  const supabase = createSupabaseServiceRoleClient();
  const resultsByPath = new Map<string, CollectorOperationResult>();
  const prepared = await mapWithConcurrency(relativePaths, RISK_LIBRARY_PREPARE_CONCURRENCY, async (relativePath) => {
    try {
      return {
        candidate: await prepareRiskLibraryCandidate(relativePath, request),
        relativePath,
      };
    } catch (error) {
      return {
        error: getErrorMessage(error),
        relativePath,
      };
    }
  });

  const candidates: RiskLibraryCandidate[] = [];

  for (const item of prepared) {
    if (item.candidate) {
      candidates.push(item.candidate);
      continue;
    }

    resultsByPath.set(item.relativePath, {
      error: item.error,
      relative_path: item.relativePath,
      success: false,
    });
  }

  const firstCandidateByHash = new Map<string, RiskLibraryCandidate>();
  const duplicateCandidates: RiskLibraryCandidate[] = [];

  for (const candidate of candidates) {
    if (firstCandidateByHash.has(candidate.imageHash)) {
      duplicateCandidates.push(candidate);
      continue;
    }

    firstCandidateByHash.set(candidate.imageHash, candidate);
  }

  const uniqueCandidates = Array.from(firstCandidateByHash.values());
  const existingReferenceByHash = new Map<string, string>();

  for (const hashChunk of chunkArray(Array.from(firstCandidateByHash.keys()), RISK_LIBRARY_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("infringement_reference_items")
      .select("id,image_hash")
      .in("image_hash", hashChunk);

    if (error) {
      for (const candidate of uniqueCandidates) {
        resultsByPath.set(candidate.relativePath, {
          error: error.message,
          relative_path: candidate.relativePath,
          success: false,
        });
      }
      return relativePaths.map(
        (relativePath) =>
          resultsByPath.get(relativePath) || {
            error: error.message,
            relative_path: relativePath,
            success: false,
          },
      );
    }

    for (const row of data || []) {
      if (typeof row.image_hash === "string" && typeof row.id === "string") {
        existingReferenceByHash.set(row.image_hash.toLowerCase(), row.id);
      }
    }
  }

  const candidatesToInsert: RiskLibraryCandidate[] = [];

  for (const candidate of uniqueCandidates) {
    const referenceId = existingReferenceByHash.get(candidate.imageHash);
    if (referenceId) {
      resultsByPath.set(candidate.relativePath, riskLibrarySuccessResult(candidate, "skipped", referenceId));
      continue;
    }

    candidatesToInsert.push(candidate);
  }

  for (const candidateChunk of chunkArray(candidatesToInsert, RISK_LIBRARY_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("infringement_reference_items")
      .insert(candidateChunk.map(riskLibraryInsertRow))
      .select("id,image_hash");

    if (error) {
      for (const candidate of candidateChunk) {
        resultsByPath.set(candidate.relativePath, {
          error: error.message,
          relative_path: candidate.relativePath,
          success: false,
        });
      }
      continue;
    }

    const insertedReferenceByHash = new Map<string, string>();
    for (const row of data || []) {
      if (typeof row.image_hash === "string" && typeof row.id === "string") {
        insertedReferenceByHash.set(row.image_hash.toLowerCase(), row.id);
      }
    }

    for (const candidate of candidateChunk) {
      resultsByPath.set(candidate.relativePath, riskLibrarySuccessResult(candidate, "added", insertedReferenceByHash.get(candidate.imageHash)));
    }
  }

  for (const candidate of duplicateCandidates) {
    const referenceId =
      existingReferenceByHash.get(candidate.imageHash) ||
      resultsByPath.get(firstCandidateByHash.get(candidate.imageHash)?.relativePath || "")?.reference_id;
    resultsByPath.set(candidate.relativePath, riskLibrarySuccessResult(candidate, "skipped", referenceId));
  }

  return relativePaths.map(
    (relativePath) =>
      resultsByPath.get(relativePath) || {
        error: "Risk library import did not return a result",
        relative_path: relativePath,
        success: false,
      },
  );
}
