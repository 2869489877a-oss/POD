import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";
import { makeProviderError } from "../errors";
import { resolveReferenceImageDataUrl } from "@/lib/ai-image/reference-image";
import { safeFetchBuffer } from "@/lib/network/safe-fetch";

type DashScopeMultimodalResponse = {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; text?: string }>;
      };
    }>;
    results?: Array<{ url?: string; b64_image?: string }>;
  };
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
};

export class TongyiProvider implements ImageProvider {
  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    const url = this.resolveMultimodalGenerationUrl(config.baseUrl);
    const prompt = params.style ? `${params.prompt}\nStyle: ${params.style}` : params.prompt;
    const content: Array<{ image: string } | { text: string }> = [];
    const referenceImage = params.referenceUrl ? await resolveReferenceImageDataUrl(params.referenceUrl) : undefined;

    if (referenceImage) {
      content.push({ image: referenceImage });
    }
    content.push({ text: prompt });

    const parameters: Record<string, unknown> = {
      n: 1,
      watermark: false,
      negative_prompt: params.negativePrompt || " ",
    };

    if (!this.isLegacyQwenImageEdit(config.modelId)) {
      parameters.prompt_extend = true;
      parameters.size = this.normalizeSize(config.modelId, Boolean(referenceImage), params.width, params.height);
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        input: {
          messages: [
            {
              role: "user",
              content,
            },
          ],
        },
        parameters,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const text = await response.text();
    const data = this.parseJson(text);

    if (!response.ok) {
      throw makeProviderError("Tongyi", response.status, text, response.statusText);
    }

    const imageValue = this.extractImageValue(data);
    if (!imageValue) {
      throw new Error("Tongyi image request did not return an image");
    }

    return this.readImageValue(imageValue);
  }

  private resolveMultimodalGenerationUrl(baseUrl?: string | null): string {
    const normalized = (baseUrl || "https://dashscope.aliyuncs.com").trim().replace(/\/+$/, "");

    if (normalized.endsWith("/services/aigc/multimodal-generation/generation")) {
      return normalized;
    }

    if (normalized.endsWith("/api/v1")) {
      return `${normalized}/services/aigc/multimodal-generation/generation`;
    }

    return `${normalized}/api/v1/services/aigc/multimodal-generation/generation`;
  }

  private normalizeSize(modelId: string, hasReferenceImage: boolean, width?: number, height?: number): string {
    if (!hasReferenceImage && this.requiresPresetSize(modelId)) {
      return this.closestPresetSize(width || 1024, height || 1024);
    }

    const safeWidth = this.clampToMultipleOf16(width || 1024, 512, 2048);
    const safeHeight = this.clampToMultipleOf16(height || 1024, 512, 2048);
    return `${safeWidth}*${safeHeight}`;
  }

  private requiresPresetSize(modelId: string): boolean {
    return /^qwen-image-(max|plus)(?:-|$)/.test(modelId);
  }

  private closestPresetSize(width: number, height: number): string {
    const ratio = width / height;
    const presets = [
      { size: "1664*928", ratio: 16 / 9 },
      { size: "1472*1104", ratio: 4 / 3 },
      { size: "1328*1328", ratio: 1 },
      { size: "1104*1472", ratio: 3 / 4 },
      { size: "928*1664", ratio: 9 / 16 },
    ];
    const closest = presets.reduce((best, item) => (
      Math.abs(item.ratio - ratio) < Math.abs(best.ratio - ratio) ? item : best
    ));
    return closest.size;
  }

  private clampToMultipleOf16(value: number, min: number, max: number): number {
    const clamped = Math.max(min, Math.min(max, Math.round(value)));
    return Math.max(min, Math.min(max, Math.round(clamped / 16) * 16));
  }

  private isLegacyQwenImageEdit(modelId: string): boolean {
    return modelId === "qwen-image-edit";
  }

  private parseJson(text: string): DashScopeMultimodalResponse | null {
    try {
      return text ? JSON.parse(text) as DashScopeMultimodalResponse : null;
    } catch {
      return null;
    }
  }

  private extractImageValue(data: DashScopeMultimodalResponse | null): string | undefined {
    const content = data?.output?.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      const imageItem = content.find((item) => typeof item.image === "string" && item.image.length > 0);
      if (imageItem?.image) return imageItem.image;
    }

    const result = data?.output?.results?.[0];
    return result?.url || result?.b64_image;
  }

  private async readImageValue(value: string): Promise<ImageGenResult> {
    const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      return { imageBase64: dataUrlMatch[2], mimeType: dataUrlMatch[1] };
    }

    if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 1000) {
      return { imageBase64: value.replace(/\s/g, ""), mimeType: "image/png" };
    }

    const buffer = await safeFetchBuffer(value, {
      allowedContentTypes: ["image/"],
      maxBytes: 25 * 1024 * 1024,
      timeoutMs: 30_000,
    });
    return {
      imageBase64: buffer.toString("base64"),
      mimeType: "image/png",
    };
  }
}
