#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;
const DEFAULT_DELAY_MS = 800;
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 4;
const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const SAVE_FORMATS = new Set(["jpeg", "png", "webp"]);
const IMAGE_URL_PATTERN = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$/i;
const employeeName = "\u7f51\u9875\u5019\u9009";
const employeeSegment = "web-risk-candidates";

function usage() {
  return `
Usage:
  npm run collect:risk-images -- --input urls.txt --collector-root /wmsFile/pod-ai-data/collector-library --limit 500

Input:
  urls.txt should contain one page URL or direct image URL per line.
  Blank lines and lines starting with # are ignored.

Options:
  --input <file>                 Required. URL list file.
  --collector-root <dir>         Collector library root. Defaults to LOCAL_DATA_DIR/collector-library or /wmsFile/pod-ai-data/collector-library on Linux.
  --limit <n>                    Max images to save. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.
  --allowed-domain <domain>      Optional allowlist. Repeatable. Example: --allowed-domain example.com
  --same-origin-images           Only save images from the same host as the source page.
  --concurrency <n>              Image download concurrency. Default ${DEFAULT_CONCURRENCY}, max ${MAX_CONCURRENCY}.
  --delay-ms <n>                 Delay before each network request. Default ${DEFAULT_DELAY_MS}.
  --max-bytes <n>                Max image size in bytes. Default ${DEFAULT_MAX_BYTES}.
  --min-width <n>                Skip images narrower than this.
  --min-height <n>               Skip images shorter than this.
  --force                        Overwrite files with the same generated name.
  --dry-run                      Discover and validate URLs without saving images.

Safety:
  This script only collects candidate reference images from URLs you provide.
  It blocks localhost/private IP targets and does not bypass login, paywalls, or anti-bot controls.
`;
}

function parseArgs(argv) {
  const options = {
    allowedDomains: [],
    collectorRoot: defaultCollectorRoot(),
    concurrency: DEFAULT_CONCURRENCY,
    date: beijingDatePath(),
    delayMs: DEFAULT_DELAY_MS,
    dryRun: false,
    force: false,
    input: "",
    limit: DEFAULT_LIMIT,
    maxBytes: DEFAULT_MAX_BYTES,
    minHeight: 0,
    minWidth: 0,
    sameOriginImages: false,
    userAgent: "PODRiskCandidateCollector/1.0",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      console.log(usage().trim());
      process.exit(0);
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--same-origin-images") {
      options.sameOriginImages = true;
      continue;
    }

    if (arg === "--input" && next) {
      options.input = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--collector-root" && next) {
      options.collectorRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--allowed-domain" && next) {
      options.allowedDomains.push(next.toLowerCase());
      index += 1;
      continue;
    }

    if (arg === "--limit" && next) {
      options.limit = Math.max(1, Math.min(MAX_LIMIT, Number(next) || DEFAULT_LIMIT));
      index += 1;
      continue;
    }

    if (arg === "--concurrency" && next) {
      options.concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(next) || DEFAULT_CONCURRENCY));
      index += 1;
      continue;
    }

    if (arg === "--delay-ms" && next) {
      options.delayMs = Math.max(0, Number(next) || DEFAULT_DELAY_MS);
      index += 1;
      continue;
    }

    if (arg === "--max-bytes" && next) {
      options.maxBytes = Math.max(1024 * 1024, Number(next) || DEFAULT_MAX_BYTES);
      index += 1;
      continue;
    }

    if (arg === "--min-width" && next) {
      options.minWidth = Math.max(0, Number(next) || 0);
      index += 1;
      continue;
    }

    if (arg === "--min-height" && next) {
      options.minHeight = Math.max(0, Number(next) || 0);
      index += 1;
      continue;
    }

    if (arg === "--user-agent" && next) {
      options.userAgent = next;
      index += 1;
    }
  }

  if (!options.input) {
    throw new Error("Missing --input urls.txt");
  }

  return options;
}

function defaultLocalDataRoot() {
  if (process.env.LOCAL_DATA_DIR) return path.resolve(process.env.LOCAL_DATA_DIR);
  if (process.platform === "win32") return path.join(repoRoot, ".local-data");
  return "/wmsFile/pod-ai-data";
}

function defaultCollectorRoot() {
  return path.join(defaultLocalDataRoot(), "collector-library");
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
  return `${year}-${month}-${day}`;
}

function normalizeUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function sanitizeSegment(value, fallback) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u0000-\u001f]+/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60);

  return normalized || fallback;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function publicUrlFor(relativePath) {
  const configured = process.env.COLLECTOR_LIBRARY_PUBLIC_URL_BASE?.trim();
  const base = configured ? stripTrailingSlash(configured) : "/uploads/collector";
  return `${base}/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }

  return true;
}

function hostAllowed(hostname, allowedDomains) {
  if (allowedDomains.length === 0) return true;
  const normalized = hostname.toLowerCase();
  return allowedDomains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

async function assertPublicHttpUrl(urlString, options) {
  const url = new URL(urlString);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostAllowed(hostname, options.allowedDomains)) {
    throw new Error(`Domain is not allowlisted: ${hostname}`);
  }

  if (hostname === "localhost" || hostname.endsWith(".local")) {
    throw new Error("Local hostnames are blocked");
  }

  const records = await lookup(hostname, { all: true });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new Error(`Private or unresolved network target blocked: ${hostname}`);
  }
}

async function fetchWithTimeout(url, options, responseType) {
  await assertPublicHttpUrl(url, options);
  await delay(options.delayMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      headers: {
        accept: responseType === "image" ? "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2" : "text/html,application/xhtml+xml",
        "user-agent": options.userAgent,
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options) {
  const response = await fetchWithTimeout(url, options, "html");
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error(`Not an HTML page: ${contentType || "unknown content-type"}`);
  }
  return response.text();
}

async function fetchImageBuffer(url, options) {
  const response = await fetchWithTimeout(url, options, "image");
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType) && !contentType.startsWith("image/")) {
    throw new Error(`Not an image: ${contentType || "unknown content-type"}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > options.maxBytes) {
    throw new Error(`Image too large: ${contentLength} bytes`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > options.maxBytes) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  return { buffer, contentType };
}

function parseSrcset(value, baseUrl) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .map((candidate) => normalizeUrl(candidate, baseUrl))
    .filter(Boolean);
}

function extractImageUrlsFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const urls = new Set();

  function add(value) {
    const normalized = normalizeUrl(value, pageUrl);
    if (normalized) urls.add(normalized);
  }

  $("img").each((_, element) => {
    for (const attr of ["src", "data-src", "data-original", "data-lazy-src", "data-zoom-image"]) {
      add($(element).attr(attr));
    }
    for (const url of parseSrcset($(element).attr("srcset"), pageUrl)) {
      urls.add(url);
    }
  });

  $("source").each((_, element) => {
    add($(element).attr("src"));
    for (const url of parseSrcset($(element).attr("srcset"), pageUrl)) {
      urls.add(url);
    }
  });

  $("meta[property='og:image'], meta[name='twitter:image'], meta[property='twitter:image']").each((_, element) => {
    add($(element).attr("content"));
  });

  $("a[href]").each((_, element) => {
    const href = normalizeUrl($(element).attr("href"), pageUrl);
    if (href && IMAGE_URL_PATTERN.test(href)) urls.add(href);
  });

  return [...urls];
}

function isLikelyImageUrl(url) {
  return IMAGE_URL_PATTERN.test(url);
}

async function readInputUrls(inputPath) {
  const raw = await readFile(inputPath, "utf8");
  const seen = new Set();
  const urls = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = normalizeUrl(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

async function discoverCandidates(inputUrl, options) {
  if (isLikelyImageUrl(inputUrl)) {
    return [{ imageUrl: inputUrl, sourcePageUrl: null }];
  }

  const html = await fetchText(inputUrl, options);
  const imageUrls = extractImageUrlsFromHtml(html, inputUrl)
    .filter((imageUrl) => {
      if (!options.sameOriginImages) return true;
      return new URL(imageUrl).hostname === new URL(inputUrl).hostname;
    });

  return imageUrls.map((imageUrl) => ({ imageUrl, sourcePageUrl: inputUrl }));
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

function extensionForFormat(format) {
  if (format === "jpeg") return ".jpg";
  if (format === "png" || format === "webp") return `.${format}`;
  return ".png";
}

async function normalizeImage(buffer) {
  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const format = metadata.format && SAVE_FORMATS.has(metadata.format) ? metadata.format : "png";

  if (format === metadata.format) {
    return { buffer, format, height: metadata.height || null, width: metadata.width || null };
  }

  const converted = await sharp(buffer).rotate().png({ compressionLevel: 9 }).toBuffer();
  const convertedMeta = await sharp(converted).metadata();
  return { buffer: converted, format: "png", height: convertedMeta.height || null, width: convertedMeta.width || null };
}

async function saveCandidate(candidate, index, options) {
  const { buffer } = await fetchImageBuffer(candidate.imageUrl, options);
  const normalized = await normalizeImage(buffer);

  if (options.minWidth > 0 && (normalized.width || 0) < options.minWidth) {
    return { skipped: true, reason: "too narrow", url: candidate.imageUrl };
  }
  if (options.minHeight > 0 && (normalized.height || 0) < options.minHeight) {
    return { skipped: true, reason: "too short", url: candidate.imageUrl };
  }

  const contentHash = createHash("sha256").update(normalized.buffer).digest("hex");
  const imageHash = await computeAverageHash(normalized.buffer);
  const sourceHost = new URL(candidate.sourcePageUrl || candidate.imageUrl).hostname;
  const siteType = sanitizeSegment(sourceHost, "web");
  const targetDir = path.join(options.collectorRoot, employeeSegment, options.date, siteType);
  const ext = extensionForFormat(normalized.format);
  const filename = `${String(index + 1).padStart(5, "0")}-${slugify(sourceHost)}-${contentHash.slice(0, 12)}${ext}`;
  const targetPath = path.join(targetDir, filename);
  const relativePath = path.join(employeeSegment, options.date, siteType, filename);

  if (options.dryRun) {
    return { dryRun: true, height: normalized.height, imageHash, relativePath: relativePath.replaceAll(path.sep, "/"), url: candidate.imageUrl, width: normalized.width };
  }

  await mkdir(targetDir, { recursive: true });

  if (!options.force) {
    try {
      await stat(targetPath);
      return { skipped: true, reason: "exists", relativePath: relativePath.replaceAll(path.sep, "/"), url: candidate.imageUrl };
    } catch {
      // file does not exist
    }
  }

  await writeFile(targetPath, normalized.buffer);
  const fileStat = await stat(targetPath);
  const now = new Date().toISOString();
  const metadata = {
    contentHash,
    createdAt: now,
    date: options.date,
    employeeName,
    fileSize: fileStat.size,
    filename,
    format: normalized.format,
    height: normalized.height,
    imageHash,
    pageUrl: candidate.sourcePageUrl,
    publicUrl: publicUrlFor(relativePath),
    relativePath: relativePath.replaceAll(path.sep, "/"),
    siteType,
    sourceUrl: candidate.imageUrl,
    updatedAt: fileStat.mtime.toISOString(),
    uploadDate: options.date,
    width: normalized.width,
  };

  await writeFile(`${targetPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return { height: normalized.height, imageHash, relativePath: metadata.relativePath, url: candidate.imageUrl, width: normalized.width };
}

async function runWorkers(items, options, workerFn) {
  const queue = items.map((item, index) => ({ index, item }));
  const results = [];

  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        results.push(await workerFn(next.item, next.index));
      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : "Unknown error",
          url: next.item.imageUrl || next.item,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, Math.max(1, queue.length)) }, () => worker()));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputUrls = await readInputUrls(options.input);
  if (inputUrls.length === 0) {
    throw new Error("Input file has no valid URLs");
  }

  const discovered = [];
  const discoveryErrors = [];

  for (const url of inputUrls) {
    try {
      const candidates = await discoverCandidates(url, options);
      for (const candidate of candidates) {
        discovered.push(candidate);
      }
    } catch (error) {
      discoveryErrors.push({ error: error instanceof Error ? error.message : "Unknown error", url });
    }
  }

  const seen = new Set();
  const uniqueCandidates = [];
  for (const candidate of discovered) {
    if (seen.has(candidate.imageUrl)) continue;
    seen.add(candidate.imageUrl);
    uniqueCandidates.push(candidate);
    if (uniqueCandidates.length >= options.limit) break;
  }

  const results = await runWorkers(uniqueCandidates, options, saveCandidate);
  const saved = results.filter((result) => result.relativePath && !result.skipped && !result.dryRun);
  const skipped = results.filter((result) => result.skipped);
  const failed = results.filter((result) => result.error);
  const dryRun = results.filter((result) => result.dryRun);

  console.log(JSON.stringify({
    collectorRoot: options.collectorRoot,
    discovered: discovered.length,
    dryRun: dryRun.length,
    failed: failed.length,
    failedSamples: failed.slice(0, 10),
    inputUrls: inputUrls.length,
    limit: options.limit,
    saved: saved.length,
    savedSamples: saved.slice(0, 20).map((item) => item.relativePath),
    skipped: skipped.length,
    targetPrefix: `${employeeSegment}/${options.date}/`,
    uniqueCandidates: uniqueCandidates.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
