import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const validTypes = new Set(["gemini", "openai", "doubao", "tongyi", "jimeng"]);

type ProviderInsert = {
  provider_type: string;
  display_name: string;
  api_key: string;
  model_id: string;
  base_url: string | null;
  daily_limit?: number | null;
  daily_used?: number;
  daily_window_start?: string;
  health_status?: string;
  is_active: boolean;
  priority: number;
};

function maskApiKey(key?: string | null): string {
  if (!key) return "****";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

function normalizeProviderRow(row: Record<string, unknown>) {
  return {
    ...row,
    api_key: maskApiKey(typeof row.api_key === "string" ? row.api_key : null),
    cooldown_until: row.cooldown_until ?? null,
    daily_limit: row.daily_limit ?? null,
    daily_used: numberOrZero(row.daily_used),
    failure_count: numberOrZero(row.failure_count),
    health_status: typeof row.health_status === "string" ? row.health_status : "healthy",
    last_error_at: row.last_error_at ?? null,
    last_error_code: row.last_error_code ?? null,
    last_error_message: row.last_error_message ?? null,
    last_success_at: row.last_success_at ?? null,
    last_used_at: row.last_used_at ?? null,
    request_count: numberOrZero(row.request_count),
    success_count: numberOrZero(row.success_count),
  };
}

export async function GET() {
  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .order("priority", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const masked = ((data ?? []) as Record<string, unknown>[]).map(normalizeProviderRow);
  return NextResponse.json({ providers: masked });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const providerType = body.provider_type;
  if (typeof providerType !== "string" || !validTypes.has(providerType)) {
    return NextResponse.json({ error: "无效的 provider_type" }, { status: 400 });
  }

  const displayName = body.display_name;
  if (typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json({ error: "请填写显示名称" }, { status: 400 });
  }

  const apiKey = body.api_key;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return NextResponse.json({ error: "请填写 API Key" }, { status: 400 });
  }

  const modelId = body.model_id;
  if (typeof modelId !== "string" || modelId.trim().length === 0) {
    return NextResponse.json({ error: "请填写模型 ID" }, { status: 400 });
  }

  const baseUrl = typeof body.base_url === "string" && body.base_url.trim().length > 0
    ? body.base_url.trim()
    : null;

  const priority = typeof body.priority === "number" ? body.priority : 0;
  const dailyLimit = parseDailyLimit(body.daily_limit);
  const today = new Date().toISOString().slice(0, 10);
  const baseInsert: ProviderInsert = {
    provider_type: providerType,
    display_name: displayName.trim(),
    api_key: apiKey.trim(),
    model_id: modelId.trim(),
    base_url: baseUrl,
    is_active: true,
    priority,
  };

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("ai_providers")
    .insert({
      ...baseInsert,
      daily_limit: dailyLimit,
      daily_used: 0,
      daily_window_start: today,
      health_status: "healthy",
    })
    .select("id")
    .single();

  if (error && isMissingRotationColumnError(error.message)) {
    const fallback = await supabase
      .from("ai_providers")
      .insert(baseInsert)
      .select("id")
      .single();

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({
      id: fallback.data.id,
      warning: "模型已保存，但健康轮询字段尚未迁移，额度统计暂不可用。",
    }, { status: 201 });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}

function parseDailyLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isMissingRotationColumnError(message: string) {
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "AI 模型配置接口异常";
}
