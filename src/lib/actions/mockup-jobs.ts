"use server";

import { createQueuedMockupJob, type MockupJobResult } from "@/lib/mockups/mockup-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function fetchMockupJobs(payload: {
  template_id?: string;
  status?: string;
}): Promise<{ error: string | null; jobs: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("mockup_outputs")
      .select("id, asset_id, template_id, output_images, status, error_message, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (payload.template_id) {
      query = query.eq("template_id", payload.template_id);
    }
    if (payload.status) {
      query = query.eq("status", payload.status);
    }

    const { data, error } = await query;
    if (error) return { error: error.message, jobs: [] };
    return { error: null, jobs: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取套图任务失败", jobs: [] };
  }
}

export async function createMockupJob(payload: {
  asset_ids: string[];
  template_id: string;
}): Promise<{ error: string | null; job: MockupJobResult | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await createQueuedMockupJob(supabase, payload.asset_ids, payload.template_id);
    return { error: null, job };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "创建套图任务失败", job: null };
  }
}
