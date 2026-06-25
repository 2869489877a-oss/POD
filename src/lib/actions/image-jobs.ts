"use server";

import { retryFailedImageJobItems } from "@/lib/image-jobs/retry-failed";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type ImageJobItemStatus = "pending" | "processing" | "completed" | "failed";
type ImageJobStatus = "pending" | "processing" | "completed" | "failed" | "partial_failed";
type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type QueueMaintenanceDetail = {
  error?: string;
  label: string;
  recovered?: number;
  requeued?: number;
};
type QueueMaintenanceResult = {
  details: QueueMaintenanceDetail[];
  error: string | null;
  ok: boolean;
  recovered?: number;
  requeued?: number;
};

const WORKER_IMAGE_JOB_TYPES = ["cutout", "print_extraction", "mockup", "resize", "infringement_check"] as const;
const QUEUE_MAINTENANCE_LIMIT = 200;
const STALE_JOB_MINUTES = 45;

type SingleRowQueueTable =
  | "asset_delete_jobs"
  | "ai_apply_pattern_jobs"
  | "ai_image_jobs"
  | "ai_split_grid_jobs"
  | "collector_operation_jobs"
  | "export_records";

type SingleRowQueueConfig = {
  exportType?: "images_zip";
  failedUpdate: Record<string, unknown>;
  itemTable?: "asset_delete_job_items" | "collector_operation_job_items";
  label: string;
  staleUpdate: Record<string, unknown>;
  table: SingleRowQueueTable;
};

const singleRowQueues: SingleRowQueueConfig[] = [
  {
    failedUpdate: { error_message: null, failed_count: 0, status: "pending" },
    itemTable: "asset_delete_job_items",
    label: "asset_delete",
    staleUpdate: { error_message: null, status: "pending" },
    table: "asset_delete_jobs",
  },
  {
    failedUpdate: { error_message: null, failed_count: 0, status: "pending" },
    itemTable: "collector_operation_job_items",
    label: "collector_operation",
    staleUpdate: { error_message: null, status: "pending" },
    table: "collector_operation_jobs",
  },
  {
    exportType: "images_zip",
    failedUpdate: { download_url: null, error_message: null, filename: null, status: "pending" },
    label: "export_images_zip",
    staleUpdate: { error_message: null, status: "pending" },
    table: "export_records",
  },
  {
    failedUpdate: {
      asset_id: null,
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      result_url: null,
      stage: "pending",
      status: "pending",
    },
    label: "ai_generate_image",
    staleUpdate: {
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      stage: "pending",
      status: "pending",
      started_at: null,
    },
    table: "ai_image_jobs",
  },
  {
    failedUpdate: {
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      result: null,
      stage: "pending",
      status: "pending",
    },
    label: "ai_split_grid",
    staleUpdate: {
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      stage: "pending",
      status: "pending",
      started_at: null,
    },
    table: "ai_split_grid_jobs",
  },
  {
    failedUpdate: {
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      result: null,
      stage: "pending",
      status: "pending",
    },
    label: "ai_apply_pattern",
    staleUpdate: {
      error_message: null,
      finished_at: null,
      progress_percent: 0,
      stage: "pending",
      status: "pending",
      started_at: null,
    },
    table: "ai_apply_pattern_jobs",
  },
];

async function countImageJobItems(
  supabase: SupabaseServiceClient,
  jobId: string,
  status?: ImageJobItemStatus,
) {
  let query = supabase
    .from("image_job_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", jobId);

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(message);
}

function staleCutoffIso() {
  return new Date(Date.now() - STALE_JOB_MINUTES * 60 * 1000).toISOString();
}

function imageJobStatusFromCounts(counts: Record<ImageJobItemStatus, number>): ImageJobStatus {
  if (counts.pending + counts.processing > 0) {
    return "processing";
  }
  if (counts.failed > 0) {
    return counts.completed > 0 ? "partial_failed" : "failed";
  }
  return "completed";
}

async function refreshImageJobCounts(supabase: SupabaseServiceClient, jobId: string) {
  const [pending, processing, completed, failed] = await Promise.all([
    countImageJobItems(supabase, jobId, "pending"),
    countImageJobItems(supabase, jobId, "processing"),
    countImageJobItems(supabase, jobId, "completed"),
    countImageJobItems(supabase, jobId, "failed"),
  ]);
  const counts = { completed, failed, pending, processing };

  const updatePayload: Record<string, unknown> = {
    failed_count: failed,
    status: imageJobStatusFromCounts(counts),
    success_count: completed,
    total_count: pending + processing + completed + failed,
  };

  if (failed === 0) {
    updatePayload.error_message = null;
  }

  const { error } = await supabase
    .from("image_jobs")
    .update(updatePayload)
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message);
  }
}

async function recoverStaleImageJobItems(supabase: SupabaseServiceClient): Promise<QueueMaintenanceDetail> {
  const { data, error } = await supabase
    .from("image_job_items")
    .select("id,job_id,image_jobs!inner(job_type,status)")
    .eq("status", "processing")
    .in("image_jobs.job_type", WORKER_IMAGE_JOB_TYPES)
    .lt("updated_at", staleCutoffIso())
    .limit(QUEUE_MAINTENANCE_LIMIT);

  if (error) {
    return { error: error.message, label: "image_job_items", recovered: 0 };
  }

  const rows = (data ?? []) as Array<{ id: string; job_id: string }>;
  const itemIds = rows.map((row) => row.id);
  if (itemIds.length === 0) {
    return { label: "image_job_items", recovered: 0 };
  }

  const { error: updateError } = await supabase
    .from("image_job_items")
    .update({ error_message: null, status: "pending" })
    .in("id", itemIds);

  if (updateError) {
    return { error: updateError.message, label: "image_job_items", recovered: 0 };
  }

  const jobIds = Array.from(new Set(rows.map((row) => row.job_id)));
  await Promise.all(jobIds.map((jobId) => refreshImageJobCounts(supabase, jobId)));

  return { label: "image_job_items", recovered: itemIds.length };
}

async function requeueFailedImageJobItems(supabase: SupabaseServiceClient): Promise<QueueMaintenanceDetail> {
  const { data, error } = await supabase
    .from("image_job_items")
    .select("id,job_id,image_jobs!inner(job_type,status)")
    .eq("status", "failed")
    .in("image_jobs.job_type", WORKER_IMAGE_JOB_TYPES)
    .limit(QUEUE_MAINTENANCE_LIMIT);

  if (error) {
    return { error: error.message, label: "image_job_items", requeued: 0 };
  }

  const rows = (data ?? []) as Array<{ id: string; job_id: string }>;
  const itemIds = rows.map((row) => row.id);
  if (itemIds.length === 0) {
    return { label: "image_job_items", requeued: 0 };
  }

  const { error: updateError } = await supabase
    .from("image_job_items")
    .update({ error_message: null, output_url: null, status: "pending" })
    .in("id", itemIds);

  if (updateError) {
    return { error: updateError.message, label: "image_job_items", requeued: 0 };
  }

  const jobIds = Array.from(new Set(rows.map((row) => row.job_id)));
  await Promise.all(jobIds.map((jobId) => refreshImageJobCounts(supabase, jobId)));

  return { label: "image_job_items", requeued: itemIds.length };
}

async function updateChildItemsForSingleRowQueue(
  supabase: SupabaseServiceClient,
  config: SingleRowQueueConfig,
  ids: string[],
) {
  if (!config.itemTable || ids.length === 0) {
    return;
  }

  const { error } = await supabase
    .from(config.itemTable)
    .update({ error_message: null, status: "pending" })
    .in("job_id", ids)
    .in("status", ["failed", "processing"]);

  if (error && !isMissingRelationError(error)) {
    throw new Error(error.message);
  }
}

async function recoverStaleSingleRowQueue(
  supabase: SupabaseServiceClient,
  config: SingleRowQueueConfig,
): Promise<QueueMaintenanceDetail> {
  let query = supabase
    .from(config.table)
    .select("id")
    .eq("status", "processing")
    .lt("updated_at", staleCutoffIso());

  if (config.exportType) {
    query = query.eq("export_type", config.exportType);
  }

  const { data, error } = await query.limit(QUEUE_MAINTENANCE_LIMIT);
  if (error) {
    return {
      error: isMissingRelationError(error) ? "missing table" : error.message,
      label: config.label,
      recovered: 0,
    };
  }

  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) {
    return { label: config.label, recovered: 0 };
  }

  try {
    await updateChildItemsForSingleRowQueue(supabase, config, ids);
  } catch (errorMessage) {
    return {
      error: errorMessage instanceof Error ? errorMessage.message : "failed to reset child rows",
      label: config.label,
      recovered: 0,
    };
  }

  const { error: updateError } = await supabase
    .from(config.table)
    .update(config.staleUpdate)
    .in("id", ids);

  if (updateError) {
    return { error: updateError.message, label: config.label, recovered: 0 };
  }

  return { label: config.label, recovered: ids.length };
}

async function requeueFailedSingleRowQueue(
  supabase: SupabaseServiceClient,
  config: SingleRowQueueConfig,
): Promise<QueueMaintenanceDetail> {
  let query = supabase
    .from(config.table)
    .select("id")
    .eq("status", "failed");

  if (config.exportType) {
    query = query.eq("export_type", config.exportType);
  }

  const { data, error } = await query.limit(QUEUE_MAINTENANCE_LIMIT);
  if (error) {
    return {
      error: isMissingRelationError(error) ? "missing table" : error.message,
      label: config.label,
      requeued: 0,
    };
  }

  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (ids.length === 0) {
    return { label: config.label, requeued: 0 };
  }

  try {
    await updateChildItemsForSingleRowQueue(supabase, config, ids);
  } catch (errorMessage) {
    return {
      error: errorMessage instanceof Error ? errorMessage.message : "failed to reset child rows",
      label: config.label,
      requeued: 0,
    };
  }

  const { error: updateError } = await supabase
    .from(config.table)
    .update(config.failedUpdate)
    .in("id", ids);

  if (updateError) {
    return { error: updateError.message, label: config.label, requeued: 0 };
  }

  return { label: config.label, requeued: ids.length };
}

function summarizeMaintenance(details: QueueMaintenanceDetail[]): QueueMaintenanceResult {
  const recovered = details.reduce((sum, item) => sum + (item.recovered ?? 0), 0);
  const requeued = details.reduce((sum, item) => sum + (item.requeued ?? 0), 0);
  const hardErrors = details.filter((item) => item.error && item.error !== "missing table");

  return {
    details,
    error: hardErrors.length > 0 ? hardErrors.map((item) => `${item.label}: ${item.error}`).join("; ") : null,
    ok: hardErrors.length === 0,
    recovered,
    requeued,
  };
}

export async function recoverStaleWorkerQueues(): Promise<QueueMaintenanceResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const details = await Promise.all([
      recoverStaleImageJobItems(supabase),
      ...singleRowQueues.map((config) => recoverStaleSingleRowQueue(supabase, config)),
    ]);

    return summarizeMaintenance(details);
  } catch (error) {
    return {
      details: [],
      error: error instanceof Error ? error.message : "failed to recover stale queues",
      ok: false,
      recovered: 0,
    };
  }
}

export async function requeueFailedWorkerQueues(): Promise<QueueMaintenanceResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const details = await Promise.all([
      requeueFailedImageJobItems(supabase),
      ...singleRowQueues.map((config) => requeueFailedSingleRowQueue(supabase, config)),
    ]);

    return summarizeMaintenance(details);
  } catch (error) {
    return {
      details: [],
      error: error instanceof Error ? error.message : "failed to requeue failed queues",
      ok: false,
      requeued: 0,
    };
  }
}

export async function fetchImageJobs(): Promise<{ error: string | null; jobs: unknown[] }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("image_jobs")
      .select("id, job_type, status, total_count, success_count, failed_count, error_message, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(120);

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

export async function fetchImageJobSummary(jobId: string): Promise<{ error: string | null; job: unknown | null }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: job, error: jobError } = await supabase
      .from("image_jobs")
      .select("id, job_type, status, total_count, success_count, failed_count, options, error_message, created_at, updated_at")
      .eq("id", jobId)
      .single();

    if (jobError) return { error: jobError.message, job: null };

    const [pending, processing, completed, failed] = await Promise.all([
      countImageJobItems(supabase, jobId, "pending"),
      countImageJobItems(supabase, jobId, "processing"),
      countImageJobItems(supabase, jobId, "completed"),
      countImageJobItems(supabase, jobId, "failed"),
    ]);

    return {
      error: null,
      job: {
        ...job,
        failed_count: failed,
        item_status_counts: { completed, failed, pending, processing },
        success_count: completed,
        total_count: pending + processing + completed + failed,
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "读取任务进度失败", job: null };
  }
}

export async function retryImageJob(
  jobId: string,
  itemIds?: string[],
): Promise<{ error: string | null; job?: unknown; ok: boolean }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await retryFailedImageJobItems(supabase, jobId, itemIds);
    return { error: null, job, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "重试失败", ok: false };
  }
}
