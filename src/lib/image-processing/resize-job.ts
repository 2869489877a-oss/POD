import "server-only";

import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type ImageJobRow = {
  error_message: string | null;
  failed_count: number;
  id: string;
  job_type: string;
  options: unknown;
  status: "pending" | "processing" | "completed" | "failed" | "partial_failed";
  success_count: number;
  total_count: number;
};

type ImageJobItemRow = {
  asset_id: string;
  error_message: string | null;
  id: string;
  input_url: string;
  output_url: string | null;
  status: "pending" | "processing" | "completed" | "failed";
};

export type ResizeJobProgress = {
  failed_count: number;
  id: string;
  items: ImageJobItemRow[];
  status: ImageJobRow["status"];
  success_count: number;
  total_count: number;
};

export async function getResizeJobProgress(
  supabase: SupabaseServiceClient,
  jobId: string,
): Promise<ResizeJobProgress> {
  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,status,total_count,success_count,failed_count,error_message,options")
    .eq("id", jobId)
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  const job = jobData as unknown as ImageJobRow;
  if (job.job_type !== "resize") {
    throw new Error("任务类型不是批量改尺寸");
  }

  const { data: itemData, error: itemError } = await supabase
    .from("image_job_items")
    .select("id,asset_id,input_url,output_url,status,error_message")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (itemError) {
    throw new Error(itemError.message);
  }

  return {
    failed_count: job.failed_count,
    id: job.id,
    items: (itemData ?? []) as unknown as ImageJobItemRow[],
    status: job.status,
    success_count: job.success_count,
    total_count: job.total_count,
  };
}
