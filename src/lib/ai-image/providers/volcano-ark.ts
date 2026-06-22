import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";
import { makeProviderError } from "../errors";
import { resolveReferenceImageBase64 } from "@/lib/ai-image/reference-image";
import { safeFetchBuffer } from "@/lib/network/safe-fetch";

type VolcanoImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

type VolcanoImageOperation = "edit" | "generate";

type VolcanoImageRequest = {
  body: Record<string, unknown>;
  operation: VolcanoImageOperation;
};

const SEEDREAM_MIN_PIXELS = 3_686_400;
const SEEDREAM_MAX_SIDE = 4096;
const SIZE_STEP = 16;
const AI_IMAGE_REQUEST_TIMEOUT_MS = 120_000;
const AI_IMAGE_RESULT_DOWNLOAD_TIMEOUT_MS = 30_000;

function roundToStep(value: number) {
  return Math.max(SIZE_STEP, Math.ceil(value / SIZE_STEP) * SIZE_STEP);
}

export class VolcanoArkProvider implements ImageProvider {
  constructor(private readonly displayName: string) {}

  private resolveEndpoint(baseUrl: string, operation: VolcanoImageOperation): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    const targetPath = operation === "edit" ? "/images/edits" : "/images/generations";

    if (normalized.endsWith("/api/v3/images/edits") || normalized.endsWith("/api/v3/images/generations")) {
      return normalized.replace(/\/api\/v3\/images\/(?:edits|generations)$/i, `/api/v3${targetPath}`);
    }

    if (normalized.endsWith("/api/v3")) return `${normalized}${targetPath}`;
    return `${normalized}/api/v3${targetPath}`;
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

  private async buildRequest(config: ProviderConfig, params: ImageGenParams): Promise<VolcanoImageRequest> {
    const isSeedream = this.isSeedreamModel(config.modelId);
    const referenceImage = params.referenceUrl ? await resolveReferenceImageBase64(params.referenceUrl) : undefined;
    const promptParts = [params.prompt];
    if (params.style) promptParts.push(`Style: ${params.style}`);
    if (isSeedream && params.negativePrompt) promptParts.push(`Avoid: ${params.negativePrompt}`);
    const prompt = promptParts.join("\n");

    if (referenceImage) {
      return {
        operation: "edit",
        body: {
          model: config.modelId,
          prompt,
          image: referenceImage,
          n: 1,
          response_format: "b64_json",
        },
      };
    }

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt,
      n: 1,
      size: this.resolveSize(config.modelId, params.width, params.height),
      response_format: "url",
      watermark: false,
    };

    if (!isSeedream && params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    if (isSeedream) {
      body.output_format = "png";
      body.optimize_prompt_options = { mode: "standard" };
      body.sequential_image_generation = "disabled";
    }

    return { body, operation: "generate" };
  }

  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    if (!config.baseUrl) {
      throw new Error(`${this.displayName} requires a Volcano Ark base_url`);
    }

    const request = await this.buildRequest(config, params);
    const url = this.resolveEndpoint(config.baseUrl, request.operation);
    return this.doRequest(url, config.apiKey, request.body);
  }

  private async doRequest(url: string, apiKey: string, body: Record<string, unknown>): Promise<ImageGenResult> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_IMAGE_REQUEST_TIMEOUT_MS),
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
        timeoutMs: AI_IMAGE_RESULT_DOWNLOAD_TIMEOUT_MS,
      });
      return { imageBase64: buf.toString("base64"), mimeType: "image/png" };
    }

    throw new Error(`${this.displayName} did not return image data`);
  }
}
