"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function fetchImageJobs(): Promise<{ error: string | null; jobs: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("image_jobs")
      .select("id, job_type, status, total_count, success_count, failed_count, error_message, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) return { error: error.message, jobs: [] };
    return { error: null, jobs: data ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取任务失败", jobs: [] };
  }
}

export async function fetchImageJobDetail(jobId: string): Promise<{ error: string | null; job: unknown | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: job, error: jobError } = await supabase
      .from("image_jobs")
      .select("id, job_type, status, total_count, success_count, failed_count, options, error_message, created_at, updated_at")
      .eq("id", jobId)
      .single();

    if (jobError) return { error: jobError.message, job: null };

    const { data: items } = await supabase
      .from("image_job_items")
      .select("id, job_id, asset_id, input_url, output_url, status, error_message, created_at, updated_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    return { error: null, job: { ...job, items: items ?? [] } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取任务详情失败", job: null };
  }
}

export async function retryImageJob(jobId: string): Promise<{ error: string | null; ok: boolean }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error } = await supabase
      .from("image_jobs")
      .update({ status: "pending", error_message: null })
      .eq("id", jobId);

    if (error) return { error: error.message, ok: false };
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "重试失败", ok: false };
  }
}
