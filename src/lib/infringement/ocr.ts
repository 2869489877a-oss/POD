import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { safeFetchBuffer } from "@/lib/network/safe-fetch";

const OCR_LANGS = process.env.OCR_LANGS?.trim() || "eng+chi_sim";
// PSM 11 = "sparse text": find as much text as possible, good for scattered print artwork.
const OCR_PSM = process.env.OCR_PSM?.trim() || "11";
const OCR_TIMEOUT_MS = 25_000;
const OCR_MAX_DIM = 2000;

/**
 * Run Tesseract OCR on a remote image and return the recognized text.
 *
 * Returns the text (possibly an empty string when no text is found), or `null`
 * when OCR could not run at all — tesseract not installed, download/render
 * failure, or timeout. Callers should treat `null` as "not attempted" and fall
 * back to text-only detection, so the feature degrades gracefully before the
 * `tesseract` binary is installed on the server.
 */
export async function extractTextFromImageUrl(url: string): Promise<string | null> {
  let source: Buffer;
  try {
    source = await safeFetchBuffer(url, {
      allowedContentTypes: ["image/"],
      maxBytes: 25 * 1024 * 1024,
      timeoutMs: 30_000,
    });
  } catch {
    return null;
  }

  // Normalize to a downscaled grayscale PNG: faster, leaner and easier for OCR.
  let rendered: Buffer;
  try {
    rendered = await sharp(source)
      .resize(OCR_MAX_DIM, OCR_MAX_DIM, { fit: "inside", withoutEnlargement: true })
      .grayscale()
      .png()
      .toBuffer();
  } catch {
    rendered = source;
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "pod-ocr-"));
    const inputPath = join(dir, "input.png");
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

function runTesseract(inputPath: string): Promise<string | null> {
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

    function finish(value: string | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    // Spawn error (most commonly: tesseract not installed) → treat as not attempted.
    proc.on("error", () => finish(null));
    proc.on("close", (code) => finish(code === 0 ? stdout.trim() : null));
  });
}
