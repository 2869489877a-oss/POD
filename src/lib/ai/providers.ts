import "server-only";

import type { AiProvider } from "@/lib/ai/listing-schema";

export type AiProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: AiProvider;
};

type ChatMessage = {
  content: string;
  role: "system" | "user";
};

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`缺少环境变量：${name}`);
  }

  return value;
}

function getProviderPrefix(provider: AiProvider) {
  return provider === "qwen" ? "QWEN" : "DOUBAO";
}

function getChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function textFromContent(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (!part || typeof part !== "object") {
        return "";
      }

      const record = part as { content?: unknown; text?: unknown };
      return typeof record.text === "string"
        ? record.text
        : typeof record.content === "string"
          ? record.content
          : "";
    })
    .join("");

  return text.trim().length > 0 ? text : null;
}

function extractContent(data: unknown) {
  const record = data as {
    choices?: Array<{
      message?: { content?: unknown };
      text?: unknown;
    }>;
    output_text?: unknown;
  };

  const firstChoice = record.choices?.[0];
  const content = firstChoice?.message?.content ?? firstChoice?.text ?? record.output_text;
  const text = textFromContent(content);

  if (!text || text.trim().length === 0) {
    throw new Error("AI 接口没有返回文本内容");
  }

  return text;
}

export function getAiProviderConfig(provider: AiProvider): AiProviderConfig {
  const prefix = getProviderPrefix(provider);

  return {
    apiKey: requiredEnv(`${prefix}_API_KEY`, process.env[`${prefix}_API_KEY`]),
    baseUrl: requiredEnv(`${prefix}_BASE_URL`, process.env[`${prefix}_BASE_URL`]),
    model: requiredEnv(`${prefix}_MODEL`, process.env[`${prefix}_MODEL`]),
    provider,
  };
}

export async function callChatCompletions(config: AiProviderConfig, messages: ChatMessage[]) {
  const response = await fetch(getChatCompletionsUrl(config.baseUrl), {
    body: JSON.stringify({
      messages,
      model: config.model,
      temperature: 0.4,
    }),
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const text = await response.text();
  let data: unknown;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : text;
    throw new Error(`AI 接口请求失败：${response.status} ${message}`);
  }

  return extractContent(data);
}
