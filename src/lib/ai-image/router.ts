import "server-only";

import type { ImageGenParams, ImageGenResult, ImageProvider, ImageProviderType, ProviderConfig } from "./types";
import { normalizeProviderError, type ImageProviderError, type ProviderFailureKind } from "./errors";
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

const BLOCKED_HEALTH = new Set(["invalid_key", "quota_exhausted"]);
const SAME_PROVIDER_RETRY_DELAYS = [1_000, 2_500];

type ProviderRow = {
  id: string;
  provider_type: string;
  display_name?: string | null;
  api_key: string;
  base_url?: string | null;
  model_id: string;
  is_active?: boolean | null;
  priority?: number | null;
  health_status?: string | null;
  request_count?: number | null;
  success_count?: number | null;
  failure_count?: number | null;
  daily_limit?: number | null;
  daily_used?: number | null;
  daily_window_start?: string | null;
  last_used_at?: string | null;
  cooldown_until?: string | null;
};

export type ResolvedProvider = {
  baseUrl?: string | null;
  config: ProviderConfig;
  dailyLimit?: number | null;
  dailyUsed: number;
  displayName: string;
  failureCount: number;
  healthStatus: string;
  id: string;
  modelId: string;
  priority: number;
  providerType: ImageProviderType;
  requestCount: number;
  successCount: number;
};

export type ProviderAttempt = {
  error?: string;
  errorKind?: ProviderFailureKind;
  modelId: string;
  providerId: string;
  providerName: string;
  providerType: ImageProviderType;
  status: "failed" | "skipped" | "success";
};

export type GenerateWithFallbackResult = {
  attempts: ProviderAttempt[];
  resolved: ResolvedProvider;
  result: ImageGenResult;
};

export type GenerateImageOptions = {
  sameProviderRetryDelays?: readonly number[];
};

export async function resolveProvider(providerId?: string): Promise<ResolvedProvider> {
  const candidates = await resolveProviderCandidates(providerId);
  return candidates[0];
}

export async function resolveProviderCandidates(providerId?: string): Promise<ResolvedProvider[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (error) {
    throw new Error(`加载 AI 模型池失败：${error.message}`);
  }

  const rows = (data ?? []) as ProviderRow[];
  if (rows.length === 0) {
    throw new Error("没有可用的 AI 模型，请先在设置中添加并启用。");
  }

  const preferred = providerId ? rows.find((row) => row.id === providerId) : undefined;
  if (providerId && !preferred) {
    throw new Error("指定的 AI 模型不存在或已禁用。");
  }

  const pool = providerId && preferred
    ? rows.filter((row) => row.id === preferred.id || (
      row.provider_type === preferred.provider_type && row.model_id === preferred.model_id
    ))
    : rows;

  const resetRows = await Promise.all(pool.map((row) => resetDailyWindowIfNeeded(row)));
  const sorted = resetRows.sort((a, b) => compareProviderRows(a, b, providerId));
  const candidates = sorted
    .filter(isProviderUsable)
    .map(resolveProviderRow);

  if (candidates.length === 0) {
    throw new Error(providerId
      ? "指定模型当前不可用，且同模型没有可轮询备用 Key。"
      : "没有可用的 AI 模型 Key：请检查是否被禁用、额度耗尽、冷却中或达到本地每日上限。");
  }

  return candidates;
}

export async function generateImage(
  resolved: ResolvedProvider,
  params: ImageGenParams,
  options: GenerateImageOptions = {},
): Promise<ImageGenResult> {
  const provider = providers[resolved.providerType];
  if (!provider) {
    throw new Error(`不支持的模型类型：${resolved.providerType}`);
  }

  const sameProviderRetryDelays = options.sameProviderRetryDelays ?? SAME_PROVIDER_RETRY_DELAYS;

  for (let attempt = 0; attempt <= sameProviderRetryDelays.length; attempt += 1) {
    try {
      return await provider.generate(resolved.config, params);
    } catch (error) {
      const normalized = normalizeProviderError(error);
      if (!shouldRetrySameProvider(normalized) || attempt === sameProviderRetryDelays.length) {
        throw normalized;
      }

      const jitter = Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, sameProviderRetryDelays[attempt] + jitter));
    }
  }

  throw new Error("图片生成重试后仍然失败。");
}

export async function generateImageWithFallback(
  providerId: string | undefined,
  params: ImageGenParams,
  options: GenerateImageOptions = {},
): Promise<GenerateWithFallbackResult> {
  const candidates = await resolveProviderCandidates(providerId);
  const attempts: ProviderAttempt[] = [];

  for (const candidate of candidates) {
    await recordProviderAttempt(candidate);

    try {
      const result = await generateImage(candidate, params, options);
      await recordProviderSuccess(candidate);
      attempts.push(buildAttempt(candidate, "success"));
      return { attempts, resolved: candidate, result };
    } catch (error) {
      const normalized = normalizeProviderError(error);
      await recordProviderFailure(candidate, normalized);
      attempts.push(buildAttempt(candidate, "failed", normalized));

      if (!shouldFallbackToNextProvider(normalized)) {
        throw normalized;
      }
    }
  }

  throw new Error(`所有可用 AI Key 均尝试失败：${attempts.map((attempt) => `${attempt.providerName}: ${attempt.error}`).join(" | ")}`);
}

function resolveProviderRow(row: ProviderRow): ResolvedProvider {
  const providerType = row.provider_type as ImageProviderType;

  return {
    baseUrl: row.base_url,
    config: {
      apiKey: row.api_key,
      baseUrl: row.base_url,
      modelId: row.model_id,
    },
    dailyLimit: numberOrNull(row.daily_limit),
    dailyUsed: numberOrZero(row.daily_used),
    displayName: row.display_name || row.model_id,
    failureCount: numberOrZero(row.failure_count),
    healthStatus: row.health_status || "healthy",
    id: row.id,
    modelId: row.model_id,
    priority: numberOrZero(row.priority),
    providerType,
    requestCount: numberOrZero(row.request_count),
    successCount: numberOrZero(row.success_count),
  };
}

function compareProviderRows(a: ProviderRow, b: ProviderRow, preferredId?: string) {
  if (preferredId) {
    if (a.id === preferredId) return -1;
    if (b.id === preferredId) return 1;
  }

  const priorityDiff = numberOrZero(b.priority) - numberOrZero(a.priority);
  if (priorityDiff !== 0) return priorityDiff;

  return timestampOrZero(a.last_used_at) - timestampOrZero(b.last_used_at);
}

function isProviderUsable(row: ProviderRow) {
  if (row.is_active === false) return false;
  const health = row.health_status || "healthy";
  if (BLOCKED_HEALTH.has(health)) return false;

  const cooldownUntil = row.cooldown_until ? Date.parse(row.cooldown_until) : 0;
  if (Number.isFinite(cooldownUntil) && cooldownUntil > Date.now()) return false;

  const dailyLimit = numberOrNull(row.daily_limit);
  if (dailyLimit !== null && dailyLimit > 0 && numberOrZero(row.daily_used) >= dailyLimit) return false;

  return true;
}

async function resetDailyWindowIfNeeded(row: ProviderRow): Promise<ProviderRow> {
  const today = new Date().toISOString().slice(0, 10);
  const currentWindow = typeof row.daily_window_start === "string" ? row.daily_window_start.slice(0, 10) : null;
  if (currentWindow === today) return row;

  const nextHealth = row.health_status === "quota_exhausted" ? "healthy" : row.health_status || "healthy";
  await safeUpdateProvider(row.id, {
    cooldown_until: row.health_status === "quota_exhausted" ? null : row.cooldown_until ?? null,
    daily_used: 0,
    daily_window_start: today,
    health_status: nextHealth,
  });

  return {
    ...row,
    cooldown_until: row.health_status === "quota_exhausted" ? null : row.cooldown_until,
    daily_used: 0,
    daily_window_start: today,
    health_status: nextHealth,
  };
}

async function recordProviderAttempt(provider: ResolvedProvider) {
  const today = new Date().toISOString().slice(0, 10);
  await safeUpdateProvider(provider.id, {
    daily_used: provider.dailyUsed + 1,
    daily_window_start: today,
    last_used_at: new Date().toISOString(),
    request_count: provider.requestCount + 1,
  });
}

async function recordProviderSuccess(provider: ResolvedProvider) {
  await safeUpdateProvider(provider.id, {
    cooldown_until: null,
    failure_count: 0,
    health_status: "healthy",
    last_error_at: null,
    last_error_code: null,
    last_error_message: null,
    last_success_at: new Date().toISOString(),
    success_count: provider.successCount + 1,
  });
}

async function recordProviderFailure(provider: ResolvedProvider, error: ImageProviderError) {
  if (!error.affectsProvider && error.kind !== "unsupported") return;

  const patch: Record<string, unknown> = {
    failure_count: provider.failureCount + 1,
    last_error_at: new Date().toISOString(),
    last_error_code: error.code || error.kind,
    last_error_message: error.message.slice(0, 1000),
  };

  if (error.affectsProvider) {
    Object.assign(patch, failureHealthPatch(error.kind));
  }

  await safeUpdateProvider(provider.id, patch);
}

function failureHealthPatch(kind: ProviderFailureKind): Record<string, unknown> {
  const now = Date.now();

  switch (kind) {
    case "quota_exhausted":
      return { cooldown_until: null, health_status: "quota_exhausted" };
    case "invalid_key":
      return { cooldown_until: null, health_status: "invalid_key" };
    case "rate_limited":
      return { cooldown_until: new Date(now + 5 * 60_000).toISOString(), health_status: "rate_limited" };
    case "network":
    case "server_error":
      return { cooldown_until: new Date(now + 2 * 60_000).toISOString(), health_status: "cooldown" };
    case "forbidden":
      return { cooldown_until: new Date(now + 30 * 60_000).toISOString(), health_status: "error" };
    default:
      return { cooldown_until: new Date(now + 60_000).toISOString(), health_status: "error" };
  }
}

async function safeUpdateProvider(providerId: string, patch: Record<string, unknown>) {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("ai_providers")
      .update(patch)
      .eq("id", providerId);

    if (error && !isMissingRotationColumnError(error.message)) {
      console.warn("Failed to update AI provider health state", error.message);
    }
  } catch (error) {
    console.warn("Failed to update AI provider health state", error);
  }
}

function shouldRetrySameProvider(error: ImageProviderError) {
  return error.retryable && (
    error.kind === "network"
    || error.kind === "rate_limited"
    || error.kind === "server_error"
  );
}

function shouldFallbackToNextProvider(error: ImageProviderError) {
  if (error.kind === "invalid_request") return false;
  if (error.kind === "unsupported") return true;
  return error.affectsProvider && (
    error.kind === "forbidden"
    || error.kind === "invalid_key"
    || error.kind === "network"
    || error.kind === "quota_exhausted"
    || error.kind === "rate_limited"
    || error.kind === "server_error"
  );
}

function buildAttempt(
  provider: ResolvedProvider,
  status: ProviderAttempt["status"],
  error?: ImageProviderError,
): ProviderAttempt {
  return {
    error: error?.message,
    errorKind: error?.kind,
    modelId: provider.modelId,
    providerId: provider.id,
    providerName: provider.displayName,
    providerType: provider.providerType,
    status,
  };
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timestampOrZero(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isMissingRotationColumnError(message: string) {
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message);
}
