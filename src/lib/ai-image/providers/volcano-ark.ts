import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";
import { safeFetchBuffer } from "@/lib/network/safe-fetch";

type VolcanoImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
};

export class VolcanoArkProvider implements ImageProvider {
  constructor(private readonly displayName: string) {}

  private resolveEndpoint(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (normalized.endsWith("/api/v3/images/generations")) return normalized;
    if (normalized.endsWith("/api/v3")) return `${normalized}/images/generations`;
    return `${normalized}/api/v3/images/generations`;
  }

  private resolveSize(width?: number, height?: number): string {
    const longestSide = Math.max(width || 1024, height || 1024);
    if (longestSide >= 2048) return "4K";
    if (longestSide >= 1024) return "2K";
    return "1K";
  }

  private isSeedreamModel(modelId: string): boolean {
    return /seedream/i.test(modelId);
  }

  private buildRequestBody(config: ProviderConfig, params: ImageGenParams): Record<string, unknown> {
    const isSeedream = this.isSeedreamModel(config.modelId);
    const promptParts = [params.prompt];
    if (params.style) promptParts.push(`Style: ${params.style}`);
    if (isSeedream && params.negativePrompt) promptParts.push(`Avoid: ${params.negativePrompt}`);

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt: promptParts.join("\n"),
      n: 1,
      size: this.resolveSize(params.width, params.height),
      response_format: "url",
      watermark: false,
    };

    if (!isSeedream && params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    if (params.referenceUrl) {
      body.image = params.referenceUrl;
    }

    if (isSeedream) {
      body.output_format = "png";
      body.optimize_prompt_options = { mode: "standard" };
      body.sequential_image_generation = params.referenceUrl ? "auto" : "disabled";

      if (params.referenceUrl) {
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
    const body = this.buildRequestBody(config, params);
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
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${this.displayName} API error ${response.status}: ${text}`);
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
        timeoutMs: 30_000,
      });
      return { imageBase64: buf.toString("base64"), mimeType: "image/png" };
    }

    throw new Error(`${this.displayName} did not return image data`);
  }
}
