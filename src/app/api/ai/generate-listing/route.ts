import { NextResponse } from "next/server";

import { buildListingPrompt, buildRepairPrompt } from "@/lib/ai/listing-prompt";
import {
  parseListingJson,
  type AiProvider,
  type ListingGenerationInput,
  type ListingGenerationResult,
} from "@/lib/ai/listing-schema";
import { callChatCompletions, getAiProviderConfig } from "@/lib/ai/providers";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GenerateListingRequest = {
  image_description?: unknown;
  product_draft_id?: unknown;
  product_type?: unknown;
  provider?: unknown;
  style?: unknown;
  target_platform?: unknown;
  theme?: unknown;
};

function getProvider(value: unknown): AiProvider {
  if (value === "qwen" || value === "doubao") {
    return value;
  }

  throw new Error("请选择有效的 AI provider");
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`请填写 ${field}`);
  }

  return value.trim();
}

function optionalProductDraftId(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

async function parseOrRepairListing(
  provider: AiProvider,
  rawResponse: string,
): Promise<ListingGenerationResult> {
  try {
    return parseListingJson(rawResponse);
  } catch {
    const config = getAiProviderConfig(provider);
    const repairedResponse = await callChatCompletions(config, buildRepairPrompt(rawResponse));
    return parseListingJson(repairedResponse);
  }
}

async function saveAiGeneration(params: {
  errorMessage?: string | null;
  productDraftId: null | string;
  prompt: string;
  provider: AiProvider;
  response: ListingGenerationResult | Record<string, never>;
  status: "completed" | "failed";
}) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_generations")
    .insert({
      error_message: params.errorMessage ?? null,
      product_draft_id: params.productDraftId,
      prompt: params.prompt,
      provider: params.provider,
      response: params.response,
      status: params.status,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`AI 生成记录保存失败：${error.message}`);
  }

  return (data as unknown as { id: string }).id;
}

async function updateProductDraft(productDraftId: string, input: ListingGenerationInput, result: ListingGenerationResult) {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("product_drafts")
    .update({
      bullet_points: result.bullet_points,
      description: result.description,
      product_type: input.product_type,
      sku: result.sku_prefix,
      tags: result.tags,
      title: result.title,
    })
    .eq("id", productDraftId);

  if (error) {
    throw new Error(`商品草稿更新失败：${error.message}`);
  }
}

export async function POST(request: Request) {
  let body: GenerateListingRequest;
  let input: ListingGenerationInput | null = null;
  let prompt = "";

  try {
    body = (await request.json()) as GenerateListingRequest;
    const provider = getProvider(body.provider);
    input = {
      image_description: requiredString(body.image_description, "图片描述"),
      product_draft_id: optionalProductDraftId(body.product_draft_id),
      product_type: requiredString(body.product_type, "产品类型"),
      provider,
      style: requiredString(body.style, "风格"),
      target_platform: requiredString(body.target_platform, "目标平台"),
      theme: requiredString(body.theme, "主题"),
    };

    const { fullPrompt, messages } = buildListingPrompt(input);
    prompt = fullPrompt;

    const config = getAiProviderConfig(provider);
    const rawResponse = await callChatCompletions(config, messages);
    const result = await parseOrRepairListing(provider, rawResponse);
    const generationId = await saveAiGeneration({
      productDraftId: input.product_draft_id ?? null,
      prompt,
      provider,
      response: result,
      status: "completed",
    });

    if (input.product_draft_id) {
      await updateProductDraft(input.product_draft_id, input, result);
    }

    return NextResponse.json({
      generation_id: generationId,
      result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI 生成失败";

    if (input && prompt) {
      try {
        await saveAiGeneration({
          errorMessage,
          productDraftId: input.product_draft_id ?? null,
          prompt,
          provider: input.provider,
          response: {},
          status: "failed",
        });
      } catch {
        // The user-facing error should stay focused on the original generation failure.
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
