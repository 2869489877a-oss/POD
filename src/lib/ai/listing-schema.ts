export type AiProvider = "qwen" | "doubao";

export type ListingGenerationInput = {
  image_description: string;
  product_draft_id?: string | null;
  product_type: string;
  provider: AiProvider;
  style: string;
  target_platform: string;
  theme: string;
};

export type ListingGenerationResult = {
  bullet_points: string[];
  description: string;
  seo_keywords: string[];
  sku_prefix: string;
  tags: string[];
  title: string;
};

const forbiddenTerms = ["disney", "nike", "marvel", "hello kitty"];

function asString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`AI 返回缺少有效字段：${field}`);
  }

  return value.trim();
}

function asStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`AI 返回字段不是数组：${field}`);
  }

  const values = value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`AI 返回数组字段包含非法值：${field}`);
    }

    return item.trim();
  });

  if (values.length === 0) {
    throw new Error(`AI 返回数组字段为空：${field}`);
  }

  return values;
}

function extractJsonCandidate(text: string) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function parseListingJson(text: string): ListingGenerationResult {
  const candidate = extractJsonCandidate(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("AI 返回内容不是有效 JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 返回 JSON 不是对象");
  }

  const record = parsed as Record<string, unknown>;
  const result: ListingGenerationResult = {
    bullet_points: asStringArray(record.bullet_points, "bullet_points"),
    description: asString(record.description, "description"),
    seo_keywords: asStringArray(record.seo_keywords, "seo_keywords"),
    sku_prefix: asString(record.sku_prefix, "sku_prefix"),
    tags: asStringArray(record.tags, "tags"),
    title: asString(record.title, "title"),
  };

  const outputText = JSON.stringify(result).toLowerCase();
  const forbiddenTerm = forbiddenTerms.find((term) => outputText.includes(term));

  if (forbiddenTerm) {
    throw new Error(`AI 返回包含禁止品牌词：${forbiddenTerm}`);
  }

  return result;
}
