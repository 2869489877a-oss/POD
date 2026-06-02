import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";

export class VolcanoArkProvider implements ImageProvider {
  constructor(private readonly displayName: string) {}

  private resolveSize(width?: number, height?: number): string {
    const w = width || 1024;
    if (w >= 2048) return "4k";
    if (w >= 1024) return "2k";
    return "1k";
  }

  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    if (!config.baseUrl) {
      throw new Error(`${this.displayName}需要配置 base_url（火山方舟地址）`);
    }

    const url = `${config.baseUrl.replace(/\/+$/, "")}/api/v3/images/generations`;

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt: params.prompt,
      n: 1,
      size: this.resolveSize(params.width, params.height),
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled",
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
    }

    if (params.referenceUrl) {
      body.image = params.referenceUrl;
    }

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

    const data = await response.json() as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };

    const first = data.data?.[0];
    if (first?.b64_json) {
      return { imageBase64: first.b64_json, mimeType: "image/png" };
    }
    if (first?.url) {
      const imgRes = await fetch(first.url, { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) throw new Error(`${this.displayName}图片下载失败`);
      const buf = await imgRes.arrayBuffer();
      return { imageBase64: Buffer.from(buf).toString("base64"), mimeType: "image/png" };
    }

    throw new Error(`${this.displayName}未返回图片数据`);
  }
}
