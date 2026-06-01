import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const templateColumns = [
  "id",
  "name",
  "product_type",
  "scenes",
  "status",
  "created_at",
  "updated_at",
].join(",");

function getTemplateId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export async function GET(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少模板 ID" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("mockup_templates")
    .select(templateColumns)
    .eq("id", templateId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}

async function getTemplateUsageCount(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
  templateId: string,
) {
  const { count, error } = await supabase
    .from("mockup_outputs")
    .select("id", { count: "exact", head: true })
    .eq("template_id", templateId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function DELETE(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少模板 ID" }, { status: 400 });
  }

  let body: { dry_run?: unknown; force?: unknown } = {};

  try {
    body = (await request.json()) as { dry_run?: unknown; force?: unknown };
  } catch {
    body = {};
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    const { data: template, error: templateError } = await supabase
      .from("mockup_templates")
      .select("id")
      .eq("id", templateId)
      .maybeSingle();

    if (templateError) {
      throw new Error(templateError.message);
    }

    if (!template) {
      return NextResponse.json({ error: "模板不存在，请刷新后重试" }, { status: 404 });
    }

    const outputCount = await getTemplateUsageCount(supabase, templateId);
    const requiresConfirmation = outputCount > 0;

    if (body.dry_run === true) {
      return NextResponse.json({
        output_count: outputCount,
        requires_confirmation: requiresConfirmation,
      });
    }

    if (requiresConfirmation && body.force !== true) {
      return NextResponse.json(
        {
          error: "该模板已有套图生成记录，删除可能影响历史套图。是否继续？",
          output_count: outputCount,
          requires_confirmation: true,
        },
        { status: 409 },
      );
    }

    if (requiresConfirmation) {
      const { error: detachError } = await supabase
        .from("mockup_outputs")
        .update({ template_id: null })
        .eq("template_id", templateId);

      if (detachError) {
        throw new Error(
          `该模板已有套图生成记录，数据库需要允许 mockup_outputs.template_id 为空后才能删除。请先执行 migration 20260527091000_allow_delete_used_mockup_templates.sql。原始错误：${detachError.message}`,
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("mockup_templates")
      .delete()
      .eq("id", templateId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    return NextResponse.json({
      ok: true,
      output_count: outputCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除模板失败" },
      { status: 500 },
    );
  }
}
