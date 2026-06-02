import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";

export class JimengProvider implements ImageProvider {
  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    if (!config.baseUrl) {
      throw new Error("即梦需要配置 base_url（火山方舟地址）");
    }

    const url = `${config.baseUrl.replace(/\/+$/, "")}/v1/images/generations`;

    const body: Record<string, unknown> = {
      model: config.modelId,
      prompt: params.prompt,
      n: 1,
      size: `${params.width || 1024}x${params.height || 1024}`,
      response_format: "b64_json",
    };

    if (params.negativePrompt) {
      body.negative_prompt = params.negativePrompt;
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
      throw new Error(`即梦 API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      data?: Array<{ b64_json?: string }>;
    };

    const imageData = data.data?.[0]?.b64_json;
    if (!imageData) {
      throw new Error("即梦未返回图片数据");
    }

    return {
      imageBase64: imageData,
      mimeType: "image/png",
    };
  }
}
