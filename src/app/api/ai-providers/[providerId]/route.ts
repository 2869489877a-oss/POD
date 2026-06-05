import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getProviderId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export async function PATCH(request: Request) {
  const providerId = getProviderId(request);
  if (!providerId) {
    return NextResponse.json({ error: "缺少 provider ID" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "无法解析请求" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (typeof body.display_name === "string" && body.display_name.trim().length > 0) {
    updateData.display_name = body.display_name.trim();
  }
  if (typeof body.api_key === "string" && body.api_key.trim().length > 0) {
    updateData.api_key = body.api_key.trim();
  }
  if (typeof body.model_id === "string" && body.model_id.trim().length > 0) {
    updateData.model_id = body.model_id.trim();
  }
  if (body.base_url !== undefined) {
    updateData.base_url = typeof body.base_url === "string" && body.base_url.trim().length > 0
      ? body.base_url.trim()
      : null;
  }
  if (typeof body.is_active === "boolean") {
    updateData.is_active = body.is_active;
  }
  if (typeof body.priority === "number") {
    updateData.priority = body.priority;
  }
  if (body.daily_limit !== undefined) {
    updateData.daily_limit = parseDailyLimit(body.daily_limit);
  }
  if (body.reset_health === true) {
    updateData.health_status = "healthy";
    updateData.cooldown_until = null;
    updateData.failure_count = 0;
    updateData.last_error_at = null;
    updateData.last_error_code = null;
    updateData.last_error_message = null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const { error } = await supabase
    .from("ai_providers")
    .update(updateData)
    .eq("id", providerId);

  if (error && isMissingRotationColumnError(error.message)) {
    const legacyUpdate = stripRotationFields(updateData);
    if (Object.keys(legacyUpdate).length === 0) {
      return NextResponse.json({
        error: "健康轮询字段尚未迁移，请先执行 Supabase migration。",
      }, { status: 409 });
    }

    const fallback = await supabase
      .from("ai_providers")
      .update(legacyUpdate)
      .eq("id", providerId);

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      warning: "基础配置已保存，但健康轮询字段尚未迁移，额度统计暂不可用。",
    });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function parseDailyLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function stripRotationFields(updateData: Record<string, unknown>) {
  const legacy = { ...updateData };
  delete legacy.cooldown_until;
  delete legacy.daily_limit;
  delete legacy.failure_count;
  delete legacy.health_status;
  delete legacy.last_error_at;
  delete legacy.last_error_code;
  delete legacy.last_error_message;
  return legacy;
}

function isMissingRotationColumnError(message: string) {
  return /column .* does not exist|Could not find .* column|schema cache/i.test(message);
}

export async function DELETE(request: Request) {
  const providerId = getProviderId(request);
  if (!providerId) {
    return NextResponse.json({ error: "缺少 provider ID" }, { status: 400 });
  }

  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }

  const { error } = await supabase
    .from("ai_providers")
    .delete()
    .eq("id", providerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "AI 模型配置接口异常";
}
