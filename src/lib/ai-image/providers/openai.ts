import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";

export class OpenAIProvider implements ImageProvider {
  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    const baseUrl = config.baseUrl || "https://api.openai.com";
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/images/generations`;

    const size = this.resolveSize(params.width, params.height);

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt: params.prompt,
      n: 1,
      size,
      response_format: "b64_json",
    };

    if (params.style) {
      body.style = params.style;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>;
    };

    const imageData = data.data?.[0]?.b64_json;
    if (!imageData) {
      throw new Error("OpenAI 未返回图片数据");
    }

    return {
      imageBase64: imageData,
      mimeType: "image/png",
    };
  }

  private resolveSize(width?: number, height?: number): string {
    const w = width || 1024;
    const h = height || 1024;
    if (w === h) return "1024x1024";
    if (w > h) return "1792x1024";
    return "1024x1792";
  }
}
