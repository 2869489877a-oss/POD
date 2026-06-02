import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_providers")
    .select("*")
    .order("priority", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const masked = (data ?? []).map((row) => ({
    ...row,
    api_key: maskApiKey(row.api_key),
  }));

  return NextResponse.json({ providers: masked });
}

const validTypes = new Set(["gemini", "openai", "doubao", "tongyi", "jimeng"]);

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

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("ai_providers")
    .insert({
      provider_type: providerType,
      display_name: displayName.trim(),
      api_key: apiKey.trim(),
      model_id: modelId.trim(),
      base_url: baseUrl,
      is_active: true,
      priority,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
