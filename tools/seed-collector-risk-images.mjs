#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 1200;
const DEFAULT_GENERATED_COUNT = 24;
const MAX_GENERATED_COUNT = 1000;
const employeeName = "\u7cfb\u7edf\u751f\u6210";
const employeeSegment = "system-generated";
const siteType = "risk-seed";

const palettes = [
  { bg: "#111827", fg: "#f8fafc", accent: "#f97316", soft: "#1f2937" },
  { bg: "#f8fafc", fg: "#111827", accent: "#0ea5e9", soft: "#e2e8f0" },
  { bg: "#18181b", fg: "#fafafa", accent: "#ef4444", soft: "#27272a" },
  { bg: "#082f49", fg: "#ecfeff", accent: "#22d3ee", soft: "#164e63" },
  { bg: "#292524", fg: "#fff7ed", accent: "#f59e0b", soft: "#44403c" },
];

const seeds = [
  {
    badge: "FAN ART",
    title: "UNOFFICIAL FAN ART",
    subtitle: "needs rights review",
    motif: "star",
  },
  {
    badge: "LOGO",
    title: "LOGO REDRAW",
    subtitle: "brand-like mark",
    motif: "monogram",
  },
  {
    badge: "TEAM",
    title: "TEAM CREST",
    subtitle: "sports-style emblem",
    motif: "shield",
  },
  {
    badge: "POSTER",
    title: "MOVIE POSTER STYLE",
    subtitle: "licensed-work review",
    motif: "poster",
  },
  {
    badge: "ALBUM",
    title: "ALBUM COVER STYLE",
    subtitle: "music artwork review",
    motif: "record",
  },
  {
    badge: "WATERMARK",
    title: "STOCK WATERMARK",
    subtitle: "source check required",
    motif: "watermark",
  },
  {
    badge: "MERCH",
    title: "BOOTLEG MERCH",
    subtitle: "unofficial listing copy",
    motif: "stamp",
  },
  {
    badge: "MASCOT",
    title: "MASCOT HEAD",
    subtitle: "character-like artwork",
    motif: "mascot",
  },
  {
    badge: "JERSEY",
    title: "JERSEY NUMBER",
    subtitle: "team apparel context",
    motif: "number",
  },
  {
    badge: "MONOGRAM",
    title: "LUXURY MONOGRAM",
    subtitle: "pattern mark review",
    motif: "pattern",
  },
  {
    badge: "PARODY",
    title: "BRAND PARODY",
    subtitle: "trademark review",
    motif: "bolt",
  },
  {
    badge: "VECTOR",
    title: "CHARACTER VECTOR",
    subtitle: "licensed character check",
    motif: "face",
  },
  {
    badge: "SCREEN",
    title: "SCREEN CAPTURE",
    subtitle: "copyright-work review",
    motif: "frame",
  },
  {
    badge: "GAME",
    title: "GAME SPRITE",
    subtitle: "game asset review",
    motif: "pixel",
  },
  {
    badge: "CREST",
    title: "CLUB BADGE",
    subtitle: "league/team mark review",
    motif: "shield",
  },
  {
    badge: "COPY",
    title: "LOOKALIKE LOGO",
    subtitle: "similar mark review",
    motif: "rings",
  },
  {
    badge: "COLLAB",
    title: "FAKE COLLAB",
    subtitle: "listing claim review",
    motif: "stamp",
  },
  {
    badge: "LIMITED",
    title: "LIMITED EDITION",
    subtitle: "claim requires evidence",
    motif: "tag",
  },
  {
    badge: "TOUR",
    title: "TOUR SHIRT",
    subtitle: "celebrity/band review",
    motif: "record",
  },
  {
    badge: "SEAL",
    title: "OFFICIAL SEAL",
    subtitle: "emblem review",
    motif: "seal",
  },
  {
    badge: "SVG",
    title: "CARTOON SVG",
    subtitle: "character rights review",
    motif: "face",
  },
  {
    badge: "PATCH",
    title: "EMBLEM PATCH",
    subtitle: "mark-like patch",
    motif: "patch",
  },
  {
    badge: "PHOTO",
    title: "PUBLIC FIGURE PHOTO",
    subtitle: "likeness review",
    motif: "portrait",
  },
  {
    badge: "AI",
    title: "AI STYLE COPY",
    subtitle: "style/source review",
    motif: "spark",
  },
];

function parseArgs(argv) {
  const result = {
    count: DEFAULT_GENERATED_COUNT,
    date: beijingDatePath(),
    force: false,
    localRoot: defaultLocalDataRoot(),
    collectorRoot: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--force") {
      result.force = true;
      continue;
    }

    if (arg === "--root" && next) {
      result.localRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--collector-root" && next) {
      result.collectorRoot = path.resolve(next);
      index += 1;
      continue;
    }

    if (arg === "--count" && next) {
      result.count = Math.max(1, Math.min(MAX_GENERATED_COUNT, Number(next) || DEFAULT_GENERATED_COUNT));
      index += 1;
      continue;
    }

    if (arg === "--date" && next) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
        throw new Error("--date must use YYYY-MM-DD");
      }
      result.date = next;
      index += 1;
    }
  }

  return result;
}

function defaultLocalDataRoot() {
  if (process.env.LOCAL_DATA_DIR) return path.resolve(process.env.LOCAL_DATA_DIR);
  if (process.platform === "win32") return path.join(repoRoot, ".local-data");
  return "/wmsFile/pod-ai-data";
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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function motifSvg(type, palette) {
  const { accent, bg, fg, soft } = palette;

  if (type === "shield") {
    return `<path d="M600 190 845 290v185c0 215-115 366-245 445-130-79-245-230-245-445V290z" fill="${soft}" stroke="${accent}" stroke-width="22"/><path d="M600 260v590" stroke="${accent}" stroke-width="12" opacity=".45"/><path d="M455 420h290" stroke="${fg}" stroke-width="18" opacity=".7"/>`;
  }
  if (type === "monogram") {
    return `<circle cx="600" cy="430" r="200" fill="${soft}" stroke="${accent}" stroke-width="20"/><text x="600" y="500" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="190" fill="${fg}">XZ</text>`;
  }
  if (type === "poster") {
    return `<rect x="370" y="160" width="460" height="620" rx="28" fill="${soft}" stroke="${accent}" stroke-width="18"/><circle cx="510" cy="340" r="78" fill="${accent}"/><path d="M410 690 540 500l105 115 70-80 82 155z" fill="${fg}" opacity=".75"/>`;
  }
  if (type === "record") {
    return `<circle cx="600" cy="430" r="235" fill="${soft}" stroke="${accent}" stroke-width="18"/><circle cx="600" cy="430" r="78" fill="${bg}" stroke="${fg}" stroke-width="12"/><circle cx="600" cy="430" r="18" fill="${accent}"/>`;
  }
  if (type === "watermark") {
    return `<text x="600" y="430" text-anchor="middle" transform="rotate(-24 600 430)" font-family="Arial Black,Arial,sans-serif" font-size="92" fill="${accent}" opacity=".55">WATERMARK</text><rect x="250" y="210" width="700" height="430" rx="26" fill="none" stroke="${fg}" stroke-width="14" opacity=".5"/>`;
  }
  if (type === "stamp") {
    return `<g transform="rotate(-10 600 430)"><rect x="310" y="260" width="580" height="230" rx="18" fill="none" stroke="${accent}" stroke-width="24"/><text x="600" y="405" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="82" fill="${accent}">REVIEW</text></g>`;
  }
  if (type === "mascot") {
    return `<circle cx="600" cy="420" r="205" fill="${soft}" stroke="${accent}" stroke-width="18"/><circle cx="530" cy="390" r="28" fill="${fg}"/><circle cx="670" cy="390" r="28" fill="${fg}"/><path d="M510 500c55 62 125 62 180 0" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round"/><path d="M430 270l-60-90 120 40M770 270l60-90-120 40" fill="${soft}" stroke="${accent}" stroke-width="14"/>`;
  }
  if (type === "number") {
    return `<path d="M370 210h460l75 120-80 70v390H375V400l-80-70z" fill="${soft}" stroke="${accent}" stroke-width="18"/><text x="600" y="650" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="300" fill="${fg}">23</text>`;
  }
  if (type === "pattern") {
    const cells = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: 7 }, (_, col) => {
        const x = 270 + col * 110;
        const y = 145 + row * 90;
        return `<text x="${x}" y="${y}" font-family="Arial Black,Arial,sans-serif" font-size="48" fill="${(row + col) % 2 ? accent : fg}" opacity=".75">XR</text>`;
      }).join(""),
    ).join("");
    return `<rect x="230" y="120" width="740" height="620" rx="30" fill="${soft}" opacity=".85"/>${cells}`;
  }
  if (type === "bolt") {
    return `<path d="M650 125 360 520h195l-55 305 330-430H635z" fill="${accent}" stroke="${fg}" stroke-width="14" stroke-linejoin="round"/>`;
  }
  if (type === "face") {
    return `<circle cx="600" cy="410" r="210" fill="${soft}" stroke="${accent}" stroke-width="16"/><rect x="475" y="350" width="78" height="88" rx="26" fill="${fg}"/><rect x="647" y="350" width="78" height="88" rx="26" fill="${fg}"/><path d="M505 525c63 50 127 50 190 0" fill="none" stroke="${accent}" stroke-width="20" stroke-linecap="round"/>`;
  }
  if (type === "frame") {
    return `<rect x="270" y="150" width="660" height="500" rx="24" fill="${soft}" stroke="${accent}" stroke-width="18"/><rect x="310" y="205" width="580" height="360" fill="${bg}" opacity=".55"/><path d="M310 605h580" stroke="${fg}" stroke-width="14" opacity=".6"/>`;
  }
  if (type === "pixel") {
    return `<rect x="390" y="190" width="420" height="420" fill="${soft}" stroke="${accent}" stroke-width="16"/><rect x="450" y="250" width="80" height="80" fill="${fg}"/><rect x="670" y="250" width="80" height="80" fill="${fg}"/><rect x="530" y="430" width="140" height="80" fill="${accent}"/><rect x="390" y="610" width="120" height="90" fill="${accent}"/><rect x="690" y="610" width="120" height="90" fill="${accent}"/>`;
  }
  if (type === "rings") {
    return `<circle cx="520" cy="410" r="170" fill="none" stroke="${accent}" stroke-width="38"/><circle cx="680" cy="410" r="170" fill="none" stroke="${fg}" stroke-width="38" opacity=".78"/>`;
  }
  if (type === "tag") {
    return `<path d="M355 230h385l120 120v330H355z" fill="${soft}" stroke="${accent}" stroke-width="18"/><circle cx="760" cy="335" r="36" fill="${bg}" stroke="${fg}" stroke-width="12"/><text x="600" y="560" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="92" fill="${fg}">LIMITED</text>`;
  }
  if (type === "seal") {
    return `<circle cx="600" cy="420" r="230" fill="${soft}" stroke="${accent}" stroke-width="18"/><circle cx="600" cy="420" r="170" fill="none" stroke="${fg}" stroke-width="12" opacity=".65"/><text x="600" y="450" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="86" fill="${accent}">SEAL</text>`;
  }
  if (type === "patch") {
    return `<path d="M600 175 810 270v245c0 125-84 210-210 275-126-65-210-150-210-275V270z" fill="${soft}" stroke="${accent}" stroke-width="18"/><text x="600" y="495" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="86" fill="${fg}">PATCH</text>`;
  }
  if (type === "portrait") {
    return `<circle cx="600" cy="330" r="115" fill="${soft}" stroke="${accent}" stroke-width="16"/><path d="M370 720c36-155 134-235 230-235s194 80 230 235z" fill="${soft}" stroke="${accent}" stroke-width="16"/><rect x="470" y="300" width="260" height="300" fill="${bg}" opacity=".18"/>`;
  }
  if (type === "spark") {
    return `<path d="M600 130 665 345l220 65-220 65-65 220-65-220-220-65 220-65z" fill="${accent}" opacity=".92"/><circle cx="780" cy="245" r="45" fill="${fg}" opacity=".75"/><circle cx="425" cy="610" r="35" fill="${fg}" opacity=".65"/>`;
  }

  return `<path d="M600 145 670 335l205 5-162 125 58 198-171-114-171 114 58-198-162-125 205-5z" fill="${accent}" stroke="${fg}" stroke-width="12"/>`;
}

function buildSvg(seed, index, variantIndex) {
  const palette = palettes[index % palettes.length];
  const { bg, fg, accent, soft } = palette;
  const escapedTitle = xmlEscape(seed.title);
  const escapedSubtitle = xmlEscape(seed.subtitle);
  const escapedBadge = xmlEscape(seed.badge);
  const sampleLabel = `SAMPLE ${String(index + 1).padStart(4, "0")}`;
  const rotation = ((index * 17) % 18) - 9;
  const driftX = ((index * 37) % 120) - 60;
  const driftY = ((index * 53) % 120) - 60;
  const ringOpacity = 0.1 + ((index % 7) * 0.015);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DEFAULT_WIDTH}" height="${DEFAULT_HEIGHT}" viewBox="0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}">
  <rect width="1200" height="1200" fill="${bg}"/>
  <circle cx="${116 + driftX}" cy="${110 + driftY}" r="${180 + (index % 5) * 12}" fill="${accent}" opacity=".16"/>
  <circle cx="${1090 - driftX}" cy="${1070 - driftY}" r="${235 + (index % 9) * 9}" fill="${soft}" opacity=".42"/>
  <circle cx="${600 + driftX / 2}" cy="${430 - driftY / 2}" r="${285 + (variantIndex % 8) * 9}" fill="none" stroke="${fg}" stroke-opacity="${ringOpacity}" stroke-width="${4 + (index % 4)}"/>
  <rect x="84" y="82" width="1032" height="1032" rx="64" fill="none" stroke="${fg}" stroke-opacity=".16" stroke-width="4"/>
  <rect x="104" y="94" width="300" height="58" rx="29" fill="${accent}"/>
  <text x="254" y="134" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="30" fill="${bg}">${escapedBadge}</text>
  <g transform="rotate(${rotation} 600 430)">${motifSvg(seed.motif, palette)}</g>
  <text x="600" y="900" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="70" fill="${fg}" letter-spacing="1">${escapedTitle}</text>
  <text x="600" y="970" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" fill="${fg}" opacity=".72">${escapedSubtitle}</text>
  <text x="600" y="1025" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="28" fill="${accent}">${xmlEscape(sampleLabel)} / VARIANT ${String(variantIndex).padStart(2, "0")}</text>
  <text x="600" y="1075" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="${accent}">SAFE GENERATED RISK-SEED SAMPLE - NO REAL BRAND OR CHARACTER</text>
</svg>`;
}

function publicUrlFor(relativePath) {
  const configured = process.env.COLLECTOR_LIBRARY_PUBLIC_URL_BASE?.trim();
  const base = configured ? configured.replace(/\/+$/, "") : "/uploads/collector";
  return `${base}/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const collectorRoot = args.collectorRoot || path.join(args.localRoot, "collector-library");
  const targetDir = path.join(collectorRoot, employeeSegment, args.date, siteType);
  await mkdir(targetDir, { recursive: true });

  const generated = [];
  const skipped = [];
  const startedAt = new Date().toISOString();

  const padLength = Math.max(2, String(args.count).length);

  for (let index = 0; index < args.count; index += 1) {
    const seed = seeds[index % seeds.length];
    const variantIndex = Math.floor(index / seeds.length) + 1;
    const filename = `${String(index + 1).padStart(padLength, "0")}-${slugify(seed.title)}-v${String(variantIndex).padStart(2, "0")}.png`;
    const targetPath = path.join(targetDir, filename);
    const relativePath = path.join(employeeSegment, args.date, siteType, filename);

    if (!args.force && existsSync(targetPath)) {
      skipped.push(relativePath.replaceAll(path.sep, "/"));
      continue;
    }

    const svg = buildSvg(seed, index, variantIndex);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(targetPath);
    const fileStat = await stat(targetPath);

    const metadata = {
      createdAt: startedAt,
      date: args.date,
      employeeName,
      fileSize: fileStat.size,
      filename,
      format: "png",
      height: DEFAULT_HEIGHT,
      pageUrl: "generated://collector-risk-seed",
      publicUrl: publicUrlFor(relativePath),
      relativePath: relativePath.replaceAll(path.sep, "/"),
      siteType,
      sourceUrl: "generated://collector-risk-seed",
      updatedAt: fileStat.mtime.toISOString(),
      uploadDate: args.date,
      width: DEFAULT_WIDTH,
    };
    await writeFile(`${targetPath}.json`, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    generated.push(metadata.relativePath);
  }

  console.log(JSON.stringify({
    collectorRoot,
    generated: generated.length,
    paths: generated,
    skipped: skipped.length,
    skippedPaths: skipped,
    targetDir,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
