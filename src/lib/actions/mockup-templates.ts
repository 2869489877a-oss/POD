"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const templateColumns = [
  "id",
  "name",
  "product_type",
  "scenes",
  "status",
  "created_at",
  "updated_at",
].join(",");

export async function fetchTemplatesAction(): Promise<{
  error: string | null;
  templates: unknown[];
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("mockup_templates")
      .select(templateColumns)
      .order("created_at", { ascending: false });

    if (error) return { error: error.message, templates: [] };
    return { error: null, templates: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取模板失败", templates: [] };
  }
}

export async function saveTemplateAction(payload: {
  name: string;
  product_type: string;
  scenes: unknown[];
}): Promise<{ error: string | null; template: unknown | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("mockup_templates")
      .insert(payload)
      .select(templateColumns)
      .single();

    if (error) return { error: error.message, template: null };
    return { error: null, template: data };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "保存模板失败", template: null };
  }
}

export async function deleteTemplateAction(
  templateId: string,
  options: { dry_run?: boolean; force?: boolean },
): Promise<{ error: string | null; ok: boolean; requires_confirmation?: boolean }> {
  try {
    const supabase = createSupabaseServiceRoleClient();

    if (options.dry_run) {
      const { count } = await supabase
        .from("mockup_outputs")
        .select("id", { count: "exact", head: true })
        .eq("template_id", templateId);

      return {
        error: null,
        ok: true,
        requires_confirmation: (count ?? 0) > 0,
      };
    }

    const { error } = await supabase
      .from("mockup_templates")
      .delete()
      .eq("id", templateId);

    if (error) return { error: error.message, ok: false };
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "删除模板失败", ok: false };
  }
}
