#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const HF_DATASET_ID = "Voxel51/OpenLogo";
const DEFAULT_HF_ENDPOINT = (process.env.HF_ENDPOINT || "https://hf-mirror.com").replace(/\/+$/, "");
const DATASET_PAGE_URL = `https://huggingface.co/datasets/${HF_DATASET_ID}`;
const DEFAULT_COUNT = 300;
const DEFAULT_OFFSET = 0;
const MAX_COUNT = 5000;
const MAX_OFFSET = 20000;
const DEFAULT_MAX_PER_LABEL = 8;
const DEFAULT_DELAY_MS = 120;
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 5;
const employeeName = "OpenLogo公开数据集";
const employeeSegment = "public-logo-datasets";
const siteType = "openlogo";

const preferredLabels = [
  "adidas",
  "nike",
  "puma",
  "reebok",
  "newbalance",
  "converse",
  "vans",
  "gucci",
  "louisvuitton",
  "chanel",
  "dior",
  "prada",
  "versace",
  "burberry",
  "hermes",
  "rolex",
  "cartier",
  "ferrari",
  "lamborghini",
  "porsche",
  "bmw",
  "mercedes",
  "audi",
  "bentley",
  "rollsroyce",
  "tesla",
  "harleydavidson",
  "redbull",
  "monster",
  "starbucks",
  "cocacola",
  "pepsi",
  "mcdonalds",
  "burgerking",
  "kfc",
  "subway",
  "apple",
  "google",
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "amazon",
  "netflix",
  "playstation",
  "xbox",
  "nintendo",
  "disney",
  "marvel",
  "batman",
  "pokemon",
  "nba",
  "nfl",
  "espn",
  "fifa",
  "supreme",
  "bape",
  "stussy",
  "kaws",
  "chromehearts",
  "nascar",
  "john deere",
  "caterpillar",
  "fedex",
  "ups",
  "dhl",
  "nasa",
  "bbc",
];

const aliasMap = new Map([
  ["coca-cola", "cocacola"],
  ["coca_cola", "cocacola"],
  ["louis-vuitton", "louisvuitton"],
  ["louis_vuitton", "louisvuitton"],
  ["mercedes-benz", "mercedes"],
  ["mercedesbenz", "mercedes"],
  ["harley-davidson", "harleydavidson"],
  ["new-balance", "newbalance"],
  ["new_balance", "newbalance"],
  ["red-bull", "redbull"],
  ["red_bull", "redbull"],
  ["burger-king", "burgerking"],
  ["burger_king", "burgerking"],
  ["play-station", "playstation"],
  ["rolls-royce", "rollsroyce"],
  ["john-deere", "johndeere"],
  ["john_deere", "johndeere"],
  ["chrome-hearts", "chromehearts"],
]);

function usage() {
  return `
Usage:
  npm run import:openlogo-candidates -- --collector-root /wmsFile/pod-ai-data/collector-library --count 500

Options:
  --collector-root <dir>     Collector library root. Defaults to LOCAL_DATA_DIR/collector-library or /wmsFile/pod-ai-data/collector-library on Linux.
  --count <n>                Number of images to import. Default ${DEFAULT_COUNT}, max ${MAX_COUNT}.
  --offset <n>               Skip the first n balanced candidates. Use 1000 for the second batch. Default ${DEFAULT_OFFSET}, max ${MAX_OFFSET}.
  --max-per-label <n>        Balanced cap per inferred brand/label. Default ${DEFAULT_MAX_PER_LABEL}.
  --delay-ms <n>             Delay before each image request. Default ${DEFAULT_DELAY_MS}.
  --concurrency <n>          Download concurrency. Default ${DEFAULT_CONCURRENCY}, max ${MAX_CONCURRENCY}.
  --hf-endpoint <url>        Hugging Face endpoint. Default ${DEFAULT_HF_ENDPOINT}
  --force                    Overwrite same generated filenames.
  --dry-run                  Select and print candidates without downloading.

Source:
  ${DATASET_PAGE_URL}
`;
}

function parseArgs(argv) {
  const options = {
    collectorRoot: defaultCollectorRoot(),
    concurrency: DEFAULT_CONCURRENCY,
    count: DEFAULT_COUNT,
    date: beijingDatePath(),
    delayMs: DEFAULT_DELAY_MS,
    dryRun: false,
    force: false,
    hfEndpoint: DEFAULT_HF_ENDPOINT,
    maxPerLabel: DEFAULT_MAX_PER_LABEL,
    offset: DEFAULT_OFFSET,
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

    if (arg === "--collector-root" && next) {
      options.collectorRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--count" && next) {
      options.count = Math.max(1, Math.min(MAX_COUNT, Number(next) || DEFAULT_COUNT));
      index += 1;
      continue;
    }

    if (arg === "--offset" && next) {
      options.offset = Math.max(0, Math.min(MAX_OFFSET, Number(next) || DEFAULT_OFFSET));
      index += 1;
      continue;
    }

    if (arg === "--max-per-label" && next) {
      options.maxPerLabel = Math.max(1, Number(next) || DEFAULT_MAX_PER_LABEL);
      index += 1;
      continue;
    }

    if (arg === "--delay-ms" && next) {
      options.delayMs = Math.max(0, Number(next) || DEFAULT_DELAY_MS);
      index += 1;
      continue;
    }

    if (arg === "--concurrency" && next) {
      options.concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(next) || DEFAULT_CONCURRENCY));
      index += 1;
      continue;
    }

    if (arg === "--hf-endpoint" && next) {
      options.hfEndpoint = next.replace(/\/+$/, "");
      index += 1;
    }
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

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLabel(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/img\d+.*$/i, "")
    .replace(/\d+.*$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const compact = slug.replace(/-/g, "");
  return aliasMap.get(slug) || aliasMap.get(compact) || compact || "unknown";
}

function inferLabel(rfilename) {
  const parsed = path.parse(rfilename);
  const rawName = parsed.name;

  if (/^flickrlogo/i.test(rawName)) return "flickrlogos";
  if (/^belgalogos/i.test(rawName)) return "belgalogos";
  if (/^anz_sportslogo/i.test(rawName)) return "anzsports";

  return normalizeLabel(rawName);
}

function scoreCandidate(label, rfilename) {
  let score = 0;
  const lower = rfilename.toLowerCase();

  if (preferredLabels.includes(label)) score += 100;
  if (/logo|brand|sportslogo|img\d+/i.test(rfilename)) score += 10;
  if (/data\/data_(?:0|1|2|3)\//.test(rfilename)) score += 4;
  if (lower.includes("batman") || lower.includes("pokemon") || lower.includes("disney") || lower.includes("marvel")) score += 40;
  if (lower.includes("chanel") || lower.includes("gucci") || lower.includes("cartier") || lower.includes("rolex")) score += 35;
  if (lower.includes("coca") || lower.includes("nike") || lower.includes("adidas") || lower.includes("bmw")) score += 30;

  return score;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionForFormat(format) {
  if (format === "jpeg") return ".jpg";
  if (format === "png" || format === "webp") return `.${format}`;
  return ".jpg";
}

function publicUrlFor(relativePath) {
  const configured = process.env.COLLECTOR_LIBRARY_PUBLIC_URL_BASE?.trim();
  const base = configured ? configured.replace(/\/+$/, "") : "/uploads/collector";
  return `${base}/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function datasetApiUrl(options) {
  return `${options.hfEndpoint}/api/datasets/${HF_DATASET_ID}`;
}

function resolveUrlForFile(rfilename, options) {
  return `${options.hfEndpoint}/datasets/${HF_DATASET_ID}/resolve/main/${rfilename.split("/").map(encodeURIComponent).join("/")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "PODOpenLogoImporter/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} while reading ${url}`);
  return response.json();
}

async function fetchImage(url, options) {
  await delay(options.delayMs);
  const response = await fetch(url, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.2",
      "user-agent": "PODOpenLogoImporter/1.0",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer;
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

function selectBalanced(candidates, options) {
  const byLabel = new Map();
  for (const candidate of candidates) {
    const list = byLabel.get(candidate.label) || [];
    list.push(candidate);
    byLabel.set(candidate.label, list);
  }

  for (const list of byLabel.values()) {
    list.sort((left, right) => right.score - left.score || left.rfilename.localeCompare(right.rfilename));
  }

  const labels = [...byLabel.keys()].sort((left, right) => {
    const leftPreferred = preferredLabels.includes(left) ? 0 : 1;
    const rightPreferred = preferredLabels.includes(right) ? 0 : 1;
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    return left.localeCompare(right);
  });

  const selected = [];
  const perLabelCount = new Map();
  let cursor = 0;

  while (selected.length < options.count && labels.length > 0) {
    const label = labels[cursor % labels.length];
    const list = byLabel.get(label) || [];
    const used = perLabelCount.get(label) || 0;

    if (list.length === 0 || used >= options.maxPerLabel) {
      labels.splice(cursor % labels.length, 1);
      if (labels.length === 0) break;
      continue;
    }

    selected.push(list.shift());
    perLabelCount.set(label, used + 1);
    cursor += 1;
  }

  return selected;
}

async function discoverOpenLogoCandidates(options) {
  const dataset = await fetchJson(datasetApiUrl(options));
  const siblings = Array.isArray(dataset.siblings) ? dataset.siblings : [];
  const imageFiles = siblings
    .map((item) => item?.rfilename)
    .filter((name) => typeof name === "string" && /^data\/.+\.(?:jpe?g|png|webp)$/i.test(name))
    .map((rfilename) => {
      const label = inferLabel(rfilename);
      return {
        label,
        rfilename,
        score: scoreCandidate(label, rfilename),
        sourceUrl: resolveUrlForFile(rfilename, options),
      };
    })
    .filter((candidate) => candidate.label !== "unknown")
    .sort((left, right) => right.score - left.score || left.rfilename.localeCompare(right.rfilename));

  const selected = selectBalanced(imageFiles, {
    ...options,
    count: Math.min(options.count + options.offset, MAX_COUNT + MAX_OFFSET),
  });

  return selected.slice(options.offset, options.offset + options.count);
}

async function saveCandidate(candidate, index, options) {
  if (options.dryRun) {
    return {
      dryRun: true,
      label: candidate.label,
      rfilename: candidate.rfilename,
      sourceUrl: candidate.sourceUrl,
    };
  }

  const source = await fetchImage(candidate.sourceUrl, options);
  let normalized = source;
  let meta = await sharp(normalized).metadata();
  let format = meta.format;

  if (!format || !["jpeg", "png", "webp"].includes(format)) {
    normalized = await sharp(source).rotate().jpeg({ quality: 90 }).toBuffer();
    meta = await sharp(normalized).metadata();
    format = "jpeg";
  }

  const contentHash = createHash("sha256").update(normalized).digest("hex");
  const imageHash = await computeAverageHash(normalized);
  const targetDir = path.join(options.collectorRoot, employeeSegment, options.date, siteType, candidate.label);
  const sequence = options.offset + index + 1;
  const filename = `${String(sequence).padStart(5, "0")}-${slugify(candidate.label)}-${contentHash.slice(0, 12)}${extensionForFormat(format)}`;
  const targetPath = path.join(targetDir, filename);
  const relativePath = path.join(employeeSegment, options.date, siteType, candidate.label, filename);

  await mkdir(targetDir, { recursive: true });

  if (!options.force && existsSync(targetPath)) {
    return {
      label: candidate.label,
      relativePath: relativePath.replaceAll(path.sep, "/"),
      skipped: true,
    };
  }

  await writeFile(targetPath, normalized);
  const fileStat = await stat(targetPath);
  const now = new Date().toISOString();
  const metadata = {
    contentHash,
    createdAt: now,
    dataset: HF_DATASET_ID,
    date: options.date,
    employeeName,
    fileSize: fileStat.size,
    filename,
    format,
    height: meta.height || null,
    imageHash,
    label: candidate.label,
    pageUrl: DATASET_PAGE_URL,
    publicUrl: publicUrlFor(relativePath),
    relativePath: relativePath.replaceAll(path.sep, "/"),
    siteType,
    sourcePath: candidate.rfilename,
    sourceUrl: candidate.sourceUrl,
    updatedAt: fileStat.mtime.toISOString(),
    uploadDate: options.date,
    width: meta.width || null,
  };

  await writeFile(`${targetPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return {
    imageHash,
    label: candidate.label,
    relativePath: metadata.relativePath,
  };
}

async function runWorkers(items, options, workerFn) {
  const queue = items.map((item, index) => ({ index, item }));
  const results = [];

  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;

      try {
        results.push(await workerFn(next.item, next.index, options));
      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : "Unknown error",
          label: next.item.label,
          sourceUrl: next.item.sourceUrl,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.concurrency, Math.max(1, queue.length)) }, () => worker()));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const selected = await discoverOpenLogoCandidates(options);
  const results = await runWorkers(selected, options, saveCandidate);
  const saved = results.filter((result) => result.relativePath && !result.skipped && !result.dryRun);
  const skipped = results.filter((result) => result.skipped);
  const failed = results.filter((result) => result.error);
  const dryRun = results.filter((result) => result.dryRun);
  const labels = [...new Set(results.map((result) => result.label).filter(Boolean))].sort();

  console.log(JSON.stringify({
    collectorRoot: options.collectorRoot,
    dataset: HF_DATASET_ID,
    dryRun: dryRun.length,
    failed: failed.length,
    failedSamples: failed.slice(0, 10),
    labels: labels.slice(0, 80),
    offset: options.offset,
    requested: options.count,
    saved: saved.length,
    savedSamples: saved.slice(0, 20).map((item) => item.relativePath),
    selected: selected.length,
    skipped: skipped.length,
    source: DATASET_PAGE_URL,
    targetPrefix: `${employeeSegment}/${options.date}/${siteType}/`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
