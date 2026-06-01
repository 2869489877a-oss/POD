import type { ImageGenParams, ImageGenResult, ImageProvider, ProviderConfig } from "../types";

export class TongyiProvider implements ImageProvider {
  async generate(config: ProviderConfig, params: ImageGenParams): Promise<ImageGenResult> {
    const baseUrl = config.baseUrl || "https://dashscope.aliyuncs.com";
    const submitUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/services/aigc/text2image/image-synthesis`;

    const submitBody = {
      model: config.modelId,
      input: {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt || "",
      },
      parameters: {
        size: `${params.width || 1024}*${params.height || 1024}`,
        style: params.style || "<auto>",
      },
    };

    const submitResponse = await fetch(submitUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(submitBody),
    });

    if (!submitResponse.ok) {
      const text = await submitResponse.text();
      throw new Error(`通义万相提交失败 ${submitResponse.status}: ${text}`);
    }

    const submitData = await submitResponse.json() as {
      output?: { task_id?: string; task_status?: string };
    };

    const taskId = submitData.output?.task_id;
    if (!taskId) {
      throw new Error("通义万相未返回 task_id");
    }

    const result = await this.pollTask(baseUrl, config.apiKey, taskId);
    return result;
  }

  private async pollTask(baseUrl: string, apiKey: string, taskId: string): Promise<ImageGenResult> {
    const statusUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/tasks/${taskId}`;
    const maxAttempts = 60;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(2000);

      const response = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`通义万相查询失败 ${response.status}`);
      }

      const data = await response.json() as {
        output?: {
          task_status?: string;
          results?: Array<{ url?: string; b64_image?: string }>;
          message?: string;
        };
      };

      const status = data.output?.task_status;

      if (status === "SUCCEEDED") {
        const results = data.output?.results;
        const first = results?.[0];

        if (first?.b64_image) {
          return { imageBase64: first.b64_image, mimeType: "image/png" };
        }

        if (first?.url) {
          const imageResponse = await fetch(first.url);
          if (!imageResponse.ok) {
            throw new Error("通义万相图片下载失败");
          }
          const buffer = await imageResponse.arrayBuffer();
          return {
            imageBase64: Buffer.from(buffer).toString("base64"),
            mimeType: "image/png",
          };
        }

        throw new Error("通义万相未返回图片");
      }

      if (status === "FAILED") {
        throw new Error(`通义万相生成失败: ${data.output?.message || "未知错误"}`);
      }
    }

    throw new Error("通义万相生成超时");
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
