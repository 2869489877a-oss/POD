import "server-only";

import { recoverStaleProcessingRows } from "@/lib/local-worker/stale-queue";
import {
  addCollectorItemsToRiskLibrary,
  deleteCollectorItems,
  promoteCollectorItems,
  type CollectorOperationResult,
} from "@/lib/storage/collector-library";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export type CollectorOperation = "promote" | "add_to_risk_library" | "delete";
export type CollectorOperationJobStatus = "pending" | "processing" | "completed" | "failed" | "partial_failed";

export type CollectorOperationJobView = {
  created_at: string;
  error_message: string | null;
  failed_count: number;
  id: string;
  operation: CollectorOperation;
  status: CollectorOperationJobStatus;
  success_count: number;
  total_count: number;
  updated_at: string;
};

type CollectorOperationJobItemRow = {
  error_message: string | null;
  filename: string | null;
  id: string;
  relative_path: string;
  status: "pending" | "processing" | "completed" | "failed";
};

function terminalStatus(successCount: number, failedCount: number, totalCount: number): CollectorOperationJobStatus {
  if (successCount + failedCount < totalCount) return "processing";
  if (failedCount === 0) return "completed";
  if (successCount === 0) return "failed";
  return "partial_failed";
}

function filenameFromRelativePath(relativePath: string) {
  return relativePath.split("/").filter(Boolean).at(-1) || relativePath;
}

function resultStatus(result: CollectorOperationResult) {
  if (result.status) return result.status;
  if (result.success && result.asset_id) return "promoted";
  if (result.success) return "completed";
  return "failed";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function createCollectorOperationJob(
  supabase: SupabaseServiceClient,
  operation: CollectorOperation,
  relativePaths: string[],
) {
  const paths = Array.from(new Set(relativePaths.filter(Boolean)));
  if (paths.length === 0) {
    throw new Error("请选择要处理的采集图片");
  }

  const { data: job, error: jobError } = await supabase
    .from("collector_operation_jobs")
    .insert({
      failed_count: 0,
      operation,
      status: "pending",
      success_count: 0,
      total_count: paths.length,
    })
    .select("id,operation,status,total_count,success_count,failed_count,error_message,created_at,updated_at")
    .single();

  if (jobError) {
    throw new Error(`创建采集库后台任务失败: ${jobError.message}`);
  }

  const jobRow = job as unknown as CollectorOperationJobView;
  for (const chunk of chunkArray(paths, 500)) {
    const { error: itemError } = await supabase.from("collector_operation_job_items").insert(
      chunk.map((relativePath) => ({
        filename: filenameFromRelativePath(relativePath),
        job_id: jobRow.id,
        relative_path: relativePath,
        status: "pending",
      })),
    );

    if (itemError) {
      await supabase
        .from("collector_operation_jobs")
        .update({
          error_message: itemError.message,
          failed_count: paths.length,
          status: "failed",
        })
        .eq("id", jobRow.id);
      throw new Error(`创建采集库后台子任务失败: ${itemError.message}`);
    }
  }

  return jobRow;
}

export async function claimCollectorOperationJob(supabase: SupabaseServiceClient) {
  await recoverStaleProcessingRows(supabase, {
    defaultMinutes: 45,
    envName: "LOCAL_WORKER_STALE_COLLECTOR_OPERATION_MINUTES",
    table: "collector_operation_jobs",
    update: {
      error_message: null,
      status: "pending",
    },
  });

  const { data, error } = await supabase
    .from("collector_operation_jobs")
    .select("id,operation,total_count")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`领取采集库后台任务失败: ${error.message}`);
  }

  for (const row of (data ?? []) as Array<{ id: string; operation: CollectorOperation; total_count: number }>) {
    const { data: claimed } = await supabase
      .from("collector_operation_jobs")
      .update({ error_message: null, status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id,operation,total_count")
      .maybeSingle();

    if (claimed) {
      return {
        item_id: row.id,
        job_id: row.id,
        job_type: "collector_operation" as const,
        operation: row.operation,
        total_count: row.total_count,
      };
    }
  }

  return null;
}

export async function getCollectorOperationJob(supabase: SupabaseServiceClient, jobId: string) {
  const { data, error } = await supabase
    .from("collector_operation_jobs")
    .select("id,operation,status,total_count,success_count,failed_count,error_message,created_at,updated_at")
    .eq("id", jobId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as CollectorOperationJobView;
}

async function updateCollectorOperationJobCounts(
  supabase: SupabaseServiceClient,
  jobId: string,
  errorMessage: string | null = null,
) {
  const { data, error } = await supabase
    .from("collector_operation_job_items")
    .select("status,error_message")
    .eq("job_id", jobId);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{ error_message: string | null; status: string }>;
  const successCount = rows.filter((row) => row.status === "completed").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const totalCount = rows.length;
  const status = terminalStatus(successCount, failedCount, totalCount);
  const firstError =
    errorMessage ||
    rows
      .filter((row) => row.status === "failed" && row.error_message)
      .slice(0, 3)
      .map((row) => row.error_message)
      .join("; ") ||
    null;

  const { data: job, error: jobError } = await supabase
    .from("collector_operation_jobs")
    .update({
      error_message: failedCount > 0 ? firstError : null,
      failed_count: failedCount,
      status,
      success_count: successCount,
    })
    .eq("id", jobId)
    .select("id,operation,status,total_count,success_count,failed_count,error_message,created_at,updated_at")
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  return job as unknown as CollectorOperationJobView;
}

export async function executeCollectorOperationJob(supabase: SupabaseServiceClient, jobId: string) {
  const job = await getCollectorOperationJob(supabase, jobId);
  const { data: itemRows, error: itemError } = await supabase
    .from("collector_operation_job_items")
    .select("id,relative_path,filename,status,error_message")
    .eq("job_id", jobId)
    .in("status", ["pending", "processing"]);

  if (itemError) {
    throw new Error(itemError.message);
  }

  const items = (itemRows ?? []) as unknown as CollectorOperationJobItemRow[];
  if (items.length === 0) {
    return updateCollectorOperationJobCounts(supabase, jobId);
  }

  const itemIds = items.map((item) => item.id);
  await supabase
    .from("collector_operation_job_items")
    .update({ error_message: null, status: "processing" })
    .in("id", itemIds);

  const paths = items.map((item) => item.relative_path);
  const results =
    job.operation === "delete"
      ? await deleteCollectorItems(paths)
      : job.operation === "add_to_risk_library"
        ? await addCollectorItemsToRiskLibrary(paths)
        : await promoteCollectorItems(paths);
  const resultByPath = new Map(results.map((result) => [result.relative_path, result]));

  for (const item of items) {
    const result = resultByPath.get(item.relative_path);
    const success = result?.success === true;
    await supabase
      .from("collector_operation_job_items")
      .update({
        error_message: success ? null : result?.error ?? "采集库后台任务未返回结果",
        result: result
          ? {
              ...result,
              status: resultStatus(result),
            }
          : {},
        status: success ? "completed" : "failed",
      })
      .eq("id", item.id);
  }

  return updateCollectorOperationJobCounts(supabase, jobId);
}

export async function failCollectorOperationJob(
  supabase: SupabaseServiceClient,
  jobId: string,
  errorMessage: string,
) {
  const { data: items } = await supabase
    .from("collector_operation_job_items")
    .select("id,status")
    .eq("job_id", jobId)
    .in("status", ["pending", "processing"]);
  const failedIds = ((items ?? []) as Array<{ id: string }>).map((item) => item.id);

  if (failedIds.length > 0) {
    await supabase
      .from("collector_operation_job_items")
      .update({
        error_message: errorMessage,
        status: "failed",
      })
      .in("id", failedIds);
  }

  return updateCollectorOperationJobCounts(supabase, jobId, errorMessage);
}
