import "server-only";

import type { ImageGenParams, ImageGenResult, ImageProvider, ImageProviderType, ProviderConfig } from "./types";
import { DoubaoProvider } from "./providers/doubao";
import { GeminiProvider } from "./providers/gemini";
import { JimengProvider } from "./providers/jimeng";
import { OpenAIProvider } from "./providers/openai";
import { TongyiProvider } from "./providers/tongyi";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const providers: Record<ImageProviderType, ImageProvider> = {
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
  doubao: new DoubaoProvider(),
  tongyi: new TongyiProvider(),
  jimeng: new JimengProvider(),
};

export type ResolvedProvider = {
  id: string;
  providerType: ImageProviderType;
  modelId: string;
  config: ProviderConfig;
};

export async function resolveProvider(providerId?: string): Promise<ResolvedProvider> {
  const supabase = createSupabaseServiceRoleClient();

  if (providerId) {
    const { data, error } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("id", providerId)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      throw new Error("指定的 AI 模型不存在或已禁用");
    }

    return {
      id: data.id,
      providerType: data.provider_type as ImageProviderType,
      modelId: data.model_id,
      config: {
        apiKey: data.api_key,
        baseUrl: data.base_url,
        modelId: data.model_id,
      },
    };
  }

  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("没有可用的 AI 模型，请先在设置中添加");
  }

  return {
    id: data.id,
    providerType: data.provider_type as ImageProviderType,
    modelId: data.model_id,
    config: {
      apiKey: data.api_key,
      baseUrl: data.base_url,
      modelId: data.model_id,
    },
  };
}

export async function generateImage(
  resolved: ResolvedProvider,
  params: ImageGenParams,
): Promise<ImageGenResult> {
  const provider = providers[resolved.providerType];
  if (!provider) {
    throw new Error(`不支持的模型类型: ${resolved.providerType}`);
  }
  return provider.generate(resolved.config, params);
}
