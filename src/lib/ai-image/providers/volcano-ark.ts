import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";
import { makeProviderError } from "../errors";
import { resolveReferenceImageDataUrl } from "@/lib/ai-image/reference-image";
import { safeFetchBuffer } from "@/lib/network/safe-fetch";

type VolcanoImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

const SEEDREAM_MIN_PIXELS = 3_686_400;
const SEEDREAM_MAX_SIDE = 4096;
const SIZE_STEP = 16;
const VOLCANO_GENERATION_TIMEOUT_MS = 360_000;
const VOLCANO_RESULT_DOWNLOAD_TIMEOUT_MS = 120_000;

function roundToStep(value: number) {
  return Math.max(SIZE_STEP, Math.ceil(value / SIZE_STEP) * SIZE_STEP);
}

export class VolcanoArkProvider implements ImageProvider {
  constructor(private readonly displayName: string) {}

  private resolveEndpoint(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (normalized.endsWith("/api/v3/images/generations")) return normalized;
    if (normalized.endsWith("/api/v3/images/edits")) return normalized.replace(/\/images\/edits$/i, "/images/generations");
    if (normalized.endsWith("/api/v3")) return `${normalized}/images/generations`;
    return `${normalized}/api/v3/images/generations`;
  }

  private resolveSize(modelId: string, width?: number, height?: number): string {
    if (this.isSeedreamModel(modelId)) {
      return this.resolveSeedreamSize(width, height);
    }

    if (width && height) {
      return `${Math.round(width)}x${Math.round(height)}`;
    }

    const longestSide = Math.max(width || 2048, height || 2048);
    if (longestSide >= 4096) return "4k";
    if (longestSide >= 3072) return "3k";
    return "2k";
  }

  private resolveSeedreamSize(width?: number, height?: number): string {
    if (!width && !height) return "2k";

    const sourceWidth = Math.max(1, width || height || 2048);
    const sourceHeight = Math.max(1, height || width || 2048);
    const currentPixels = sourceWidth * sourceHeight;
    let scale = 1;

    if (currentPixels < SEEDREAM_MIN_PIXELS) {
      scale = Math.sqrt(SEEDREAM_MIN_PIXELS / currentPixels);
    }

    let safeWidth = roundToStep(sourceWidth * scale);
    let safeHeight = roundToStep(sourceHeight * scale);

    const maxSide = Math.max(safeWidth, safeHeight);
    if (maxSide > SEEDREAM_MAX_SIDE) {
      const maxScale = SEEDREAM_MAX_SIDE / maxSide;
      safeWidth = roundToStep(safeWidth * maxScale);
      safeHeight = roundToStep(safeHeight * maxScale);
    }

    if (safeWidth * safeHeight < SEEDREAM_MIN_PIXELS) {
      return "2k";
    }

    return `${safeWidth}x${safeHeight}`;
  }

  private isSeedreamModel(modelId: string): boolean {
    return /seedream/i.test(modelId);
  }

  private async buildRequestBody(config: ProviderConfig, params: ImageGenParams): Promise<Record<string, unknown>> {
    const isSeedream = this.isSeedreamModel(config.modelId);
    const referenceImage = params.referenceUrl ? await resolveReferenceImageDataUrl(params.referenceUrl) : undefined;
    const promptParts = [params.prompt];
    if (params.style) promptParts.push(`Style: ${params.style}`);
    if (isSeedream && params.negativePrompt) promptParts.push(`Avoid: ${params.negativePrompt}`);

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt: promptParts.join("\n"),
      n: 1,
      size: this.resolveSize(config.modelId, params.width, params.height),
      response_format: "url",
      watermark: false,
    };

    if (!isSeedream && params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    if (referenceImage) {
      body.image = referenceImage;
    }

    if (isSeedream) {
      body.output_format = "png";
      body.optimize_prompt_options = { mode: "standard" };
      body.sequential_image_generation = referenceImage ? "auto" : "disabled";

      if (referenceImage) {
        body.sequential_image_generation_options = { max_images: 1 };
      }
    }

    return body;
  }

  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    if (!config.baseUrl) {
      throw new Error(`${this.displayName} requires a Volcano Ark base_url`);
    }

    const url = this.resolveEndpoint(config.baseUrl);
    const body = await this.buildRequestBody(config, params);
    return this.doRequest(url, config.apiKey, body);
  }

  private async doRequest(url: string, apiKey: string, body: Record<string, unknown>): Promise<ImageGenResult> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VOLCANO_GENERATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text();
      throw makeProviderError(this.displayName, response.status, text, response.statusText);
    }

    const data = (await response.json()) as VolcanoImageResponse;
    const first = data.data?.[0];

    if (first?.b64_json) {
      return { imageBase64: first.b64_json, mimeType: "image/png" };
    }

    if (first?.url) {
      const buf = await safeFetchBuffer(first.url, {
        allowedContentTypes: ["image/"],
        maxBytes: 25 * 1024 * 1024,
        timeoutMs: VOLCANO_RESULT_DOWNLOAD_TIMEOUT_MS,
      });
      return { imageBase64: buf.toString("base64"), mimeType: "image/png" };
    }

    throw new Error(`${this.displayName} did not return image data`);
  }
}
