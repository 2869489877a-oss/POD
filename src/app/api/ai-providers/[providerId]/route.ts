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

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "没有需要更新的字段" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("ai_providers")
    .update(updateData)
    .eq("id", providerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const providerId = getProviderId(request);
  if (!providerId) {
    return NextResponse.json({ error: "缺少 provider ID" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("ai_providers")
    .delete()
    .eq("id", providerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
