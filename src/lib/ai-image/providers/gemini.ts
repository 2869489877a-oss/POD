import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";
import { makeProviderError, unsupportedProviderError } from "../errors";

export class GeminiProvider implements ImageProvider {
  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    if (params.referenceUrl) {
      throw unsupportedProviderError("Gemini 当前配置只支持文生图，图生图请使用 Seedream 或通义图像编辑模型");
    }

    const baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com";
    const url = `${baseUrl.replace(/\/+$/, "")}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;

    const body: Record<string, unknown> = {
      contents: [
        {
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        imageDimensions: {
          width: params.width || 1024,
          height: params.height || 1024,
        },
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw makeProviderError("Gemini", response.status, text, response.statusText);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data: string; mimeType: string } }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts;
    const imagePart = parts?.find((p) => p.inlineData?.data);

    if (!imagePart?.inlineData) {
      throw new Error("Gemini 未返回图片数据");
    }

    return {
      imageBase64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType,
    };
  }
}
