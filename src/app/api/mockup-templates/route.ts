import { NextResponse } from "next/server";

import { validateScenes } from "@/lib/mockups/scenes";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CreateTemplateRequest = {
  name?: unknown;
  product_type?: unknown;
  scenes?: unknown;
};

const templateColumns = [
  "id",
  "name",
  "product_type",
  "scenes",
  "status",
  "created_at",
  "updated_at",
].join(",");

export async function GET() {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("mockup_templates")
    .select(templateColumns)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, templates: [] }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  let body: CreateTemplateRequest;

  try {
    body = (await request.json()) as CreateTemplateRequest;
  } catch {
    return NextResponse.json({ error: "无法读取模板参数" }, { status: 400 });
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "请填写模板名称" }, { status: 400 });
  }

  if (typeof body.product_type !== "string" || body.product_type.trim().length === 0) {
    return NextResponse.json({ error: "请填写产品类型" }, { status: 400 });
  }

  let scenes;

  try {
    scenes = validateScenes(body.scenes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "scenes JSON 不合法" },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("mockup_templates")
    .insert({
      name: body.name.trim(),
      product_type: body.product_type.trim(),
      scenes,
      status: "active",
    })
    .select(templateColumns)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}
