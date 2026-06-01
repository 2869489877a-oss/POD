"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function fetchCollectionTemplates(
  includeArchived: boolean = false,
): Promise<{ error: string | null; templates: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("image_collection_templates")
      .select("*, sources:image_collection_sources(*)")
      .order("created_at", { ascending: false });

    if (!includeArchived) {
      query = query.eq("status", "active");
    }

    const { data, error } = await query;
    if (error) return { error: error.message, templates: [] };
    return { error: null, templates: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取采集模板失败", templates: [] };
  }
}

export async function fetchCollectionRuns(): Promise<{ error: string | null; runs: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("image_collection_runs")
      .select("*, template:image_collection_templates(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { error: error.message, runs: [] };

    const runs = (data ?? []).map((run: Record<string, unknown>) => ({
      ...run,
      template_name: (run.template as Record<string, unknown> | null)?.name ?? null,
    }));

    return { error: null, runs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取采集历史失败", runs: [] };
  }
}

export async function saveCollectionTemplate(payload: {
  name: string;
  main_folder_name: string;
  storage_prefix: string;
  keywords: string[];
  max_images: number;
  schedule_enabled: boolean;
  cron_expression: string;
  sources: { site_name: string; start_url: string; folder_name: string; enabled: boolean; options?: Record<string, unknown> }[];
}, editingId?: string | null): Promise<{ error: string | null; template: unknown | null; templates: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { sources, ...templateData } = payload;

    if (editingId) {
      const { error: updateError } = await supabase
        .from("image_collection_templates")
        .update(templateData)
        .eq("id", editingId);

      if (updateError) return { error: updateError.message, template: null, templates: [] };

      await supabase.from("image_collection_sources").delete().eq("template_id", editingId);

      if (sources.length > 0) {
        await supabase.from("image_collection_sources").insert(
          sources.map((s) => ({ ...s, template_id: editingId })),
        );
      }
    } else {
      const { data: newTemplate, error: insertError } = await supabase
        .from("image_collection_templates")
        .insert(templateData)
        .select("id")
        .single();

      if (insertError || !newTemplate) return { error: insertError?.message ?? "创建失败", template: null, templates: [] };

      if (sources.length > 0) {
        await supabase.from("image_collection_sources").insert(
          sources.map((s) => ({ ...s, template_id: newTemplate.id })),
        );
      }
    }

    const { templates } = await fetchCollectionTemplates(false);
    return { error: null, template: null, templates };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "保存模板失败", template: null, templates: [] };
  }
}

export async function archiveCollectionTemplate(templateId: string): Promise<{ error: string | null; ok: boolean }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("image_collection_templates")
      .update({ status: "archived" })
      .eq("id", templateId);

    if (error) return { error: error.message, ok: false };
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "归档失败", ok: false };
  }
}

export async function runCollectionTemplate(templateId: string): Promise<{ error: string | null; run: unknown | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: template } = await supabase
      .from("image_collection_templates")
      .select("*, sources:image_collection_sources(*)")
      .eq("id", templateId)
      .single();

    if (!template) return { error: "模板不存在", run: null };

    const { data: run, error } = await supabase
      .from("image_collection_runs")
      .insert({
        template_id: templateId,
        run_type: "manual",
        root_folder: template.main_folder_name,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) return { error: error.message, run: null };
    return { error: null, run };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "执行采集失败", run: null };
  }
}
