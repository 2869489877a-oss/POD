#!/usr/bin/env node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

const effects = [
  "flip_horizontal",
  "flip_vertical",
  "rotate_canvas",
  "scale_center",
  "background_fill",
  "tile_repeat",
  "mirror_grid",
  "entropy_variant",
];

const keepOutput = process.argv.includes("--keep");
const root = await mkdtemp(path.join(os.tmpdir(), "pod-fission-smoke-"));
const assetsDir = path.join(root, "assets");
const sourceDir = path.join(assetsDir, "smoke");
const outputDir = path.join(root, "outputs");

process.env.LOCAL_ASSETS_DIR = assetsDir;
process.env.LOCAL_WORKER_SECRET = process.env.LOCAL_WORKER_SECRET || "smoke-test-secret";

await mkdir(sourceDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const sourcePath = path.join(sourceDir, "source.png");
const sourceSvg = Buffer.from(`
<svg width="640" height="520" viewBox="0 0 640 520" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="520" fill="none"/>
  <circle cx="210" cy="220" r="150" fill="#14b8a6"/>
  <circle cx="370" cy="240" r="110" fill="#f97316" opacity="0.9"/>
  <path d="M150 345 C230 250 315 430 470 295" fill="none" stroke="#111827" stroke-width="38" stroke-linecap="round"/>
  <text x="132" y="235" font-family="Arial, sans-serif" font-size="68" font-weight="800" fill="#ffffff">POD</text>
  <text x="190" y="320" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#111827">TEST</text>
</svg>
`);

await sharp(sourceSvg).png().toFile(sourcePath);

const { processFission } = await import("./local-image-worker.mjs");

const results = [];

try {
  for (const effect of effects) {
    const outputFormat = effect === "background_fill" ? "jpg" : "png";
    const result = await processFission({
      input_url: "http://127.0.0.1:3000/uploads/assets/smoke/source.png",
      job_type: "fission",
      options: {
        options: {
          background_color: effect === "background_fill" ? "#f4ead4" : "transparent",
          effect_key: effect,
          output_format: outputFormat,
          output_height: 640,
          output_width: 640,
          preset_key: "smoke",
          rotation: effect === "rotate_canvas" || effect === "entropy_variant" ? 15 : 0,
          spacing: effect === "tile_repeat" || effect === "entropy_variant" ? 14 : 0,
          strength: 72,
          variant_count: effect === "entropy_variant" ? 9 : 1,
        },
      },
      item_id: `${effect}-smoke-item`,
      job_id: "smoke-job",
    });

    const output = result.files?.output;
    if (!output?.buffer || output.buffer.byteLength < 1024) {
      throw new Error(`${effect} produced an empty output`);
    }

    const metadata = await sharp(output.buffer).metadata();
    if (metadata.width !== 640 || metadata.height !== 640) {
      throw new Error(`${effect} output has wrong size: ${metadata.width}x${metadata.height}`);
    }

    if (!output.contentType?.startsWith("image/")) {
      throw new Error(`${effect} output has invalid content type`);
    }

    const target = path.join(outputDir, `${effect}.${outputFormat}`);
    await writeFile(target, output.buffer);
    results.push({
      contentType: output.contentType,
      effect,
      path: target,
      size: output.buffer.byteLength,
    });
  }

  console.log(JSON.stringify({ ok: true, outputDir, results }, null, 2));
} finally {
  if (!keepOutput) {
    await rm(root, { force: true, recursive: true });
  }
}
