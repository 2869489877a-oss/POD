import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/profile";
import { getLocalWorkerSecret } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const IMAGE_WORKER_JOB_TYPES = ["cutout", "print_extraction", "mockup", "resize", "fission", "infringement_check"] as const;
const LOCAL_WORKER_JOB_TYPES = [...IMAGE_WORKER_JOB_TYPES, "asset_delete", "collector_operation", "export_images_zip", "ai_split_grid", "ai_apply_pattern", "ai_generate_image"] as const;
const WORKER_STATUS_CACHE_TTL_MS = 10000;
const ACTIVE_IMAGE_JOB_STATUSES = ["pending", "processing"] as const;
const QUEUE_IMAGE_JOB_STATUSES = ["pending", "processing", "failed", "partial_failed"] as const;
const IMAGE_JOB_SUMMARY_LIMIT = 100;

type LocalWorkerJobType = (typeof LOCAL_WORKER_JOB_TYPES)[number];
type ImageWorkerJobType = (typeof IMAGE_WORKER_JOB_TYPES)[number];
type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type QueueStatus = "pending" | "processing" | "failed";
type ImageJobQueueStatus = (typeof QUEUE_IMAGE_JOB_STATUSES)[number];
type ImageJobQueueRow = {
  failed_count: number;
  id: string;
  job_type: string;
  status: ImageJobQueueStatus;
  success_count: number;
  total_count: number;
  updated_at: string;
};
type WorkerStatusPayload = {
  blocked_job_types: LocalWorkerJobType[];
  expected_job_types: readonly LocalWorkerJobType[];
  last_seen_seconds: number | null;
  missing_job_types: LocalWorkerJobType[];
  ok: true;
  online: boolean;
  queue: {
    active_jobs: number;
    failed: number;
    pending: number;
    processing: number;
  };
  queue_by_type: Record<LocalWorkerJobType, ReturnType<typeof emptyQueueCounts>>;
  ready: boolean;
  state_file: string;
  stale_after_seconds: number;
  worker: {
    concurrency: number | null;
    job_type_limits: Partial<Record<LocalWorkerJobType, number>>;
    job_types: LocalWorkerJobType[];
    slots: unknown[];
    started_at: string | null;
    updated_at: string | null;
    worker: string;
  } | null;
  worker_jobs: unknown[];
};

let workerStatusCache: { expiresAt: number; payload: WorkerStatusPayload } | null = null;

type WorkerState = {
  concurrency?: number;
  heartbeat_ms?: number;
  job_type_limits?: Partial<Record<LocalWorkerJobType, number>>;
  job_types?: string[];
  slots?: unknown[];
  started_at?: string;
  updated_at?: string;
  worker?: string;
};

function emptyQueueCounts() {
  return {
    failed: 0,
    pending: 0,
    processing: 0,
  };
}

function normalizeWorkerJobTypes(value: unknown): LocalWorkerJobType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set<string>(LOCAL_WORKER_JOB_TYPES);
  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim())
        .filter((item): item is LocalWorkerJobType => allowed.has(item)),
    ),
  );
}

function getLocalAssetsDir() {
  const configured = process.env.LOCAL_ASSETS_DIR?.trim();
  if (configured) {
    return configured.replace(/[\\/]+$/, "");
  }

  const tempDir = process.env.TEMP || process.env.TMP || "C:\\Windows\\Temp";
  return process.platform === "win32"
    ? `${tempDir.replace(/[\\/]+$/, "")}\\pod-ai-data\\assets`
    : "/wmsFile/pod-ai-data/assets";
}

function dirnameString(value: string) {
  const normalized = value.replace(/[\\/]+$/, "");
  const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return slashIndex > 0 ? normalized.slice(0, slashIndex) : ".";
}

function getWorkerStateFile() {
  const configured = process.env.LOCAL_WORKER_STATE_FILE?.trim();
  if (configured) {
    return configured;
  }

  const assetsDir = getLocalAssetsDir();
  const separator = assetsDir.includes("\\") ? "\\" : "/";
  return `${dirnameString(assetsDir)}${separator}worker-status.json`;
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "42P01" || code === "PGRST205" || /does not exist|schema cache/i.test(message);
}

async function readWorkerState() {
  try {
    const content = await readFile(/* turbopackIgnore: true */ getWorkerStateFile(), "utf8");
    return JSON.parse(content) as WorkerState;
  } catch {
    return null;
  }
}

async function countRowsByStatus(
  supabase: SupabaseServiceClient,
  table: "asset_delete_jobs" | "collector_operation_jobs" | "export_records" | "ai_image_jobs" | "ai_split_grid_jobs" | "ai_apply_pattern_jobs",
  status: QueueStatus,
  options: { allowMissing?: boolean; exportType?: "images_zip" } = {},
) {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (options.exportType) {
    query = query.eq("export_type", options.exportType);
  }

  const { count, error } = await query;

  if (error) {
    if (options.allowMissing && isMissingRelationError(error)) {
      return 0;
    }
    throw new Error(error.message);
  }

  return count ?? 0;
}

function addQueueCount(
  queue: ReturnType<typeof emptyQueueCounts>,
  queueByType: Record<LocalWorkerJobType, ReturnType<typeof emptyQueueCounts>>,
  jobType: LocalWorkerJobType,
  status: QueueStatus,
  count: number,
) {
  queue[status] += count;
  queueByType[jobType][status] += count;
}

function normalizeImageWorkerJobType(value: unknown): ImageWorkerJobType | null {
  return IMAGE_WORKER_JOB_TYPES.find((jobType) => jobType === value) ?? null;
}

function remainingImageJobItems(row: ImageJobQueueRow) {
  return Math.max(0, Number(row.total_count ?? 0) - Number(row.success_count ?? 0) - Number(row.failed_count ?? 0));
}

function addImageJobSummary(
  queue: ReturnType<typeof emptyQueueCounts>,
  queueByType: Record<LocalWorkerJobType, ReturnType<typeof emptyQueueCounts>>,
  row: ImageJobQueueRow,
) {
  const jobType = normalizeImageWorkerJobType(row.job_type);
  if (!jobType) return;

  const failedCount = Math.max(0, Number(row.failed_count ?? 0));
  if (failedCount > 0) {
    addQueueCount(queue, queueByType, jobType, "failed", failedCount);
  }

  if (row.status === "failed") {
    const failedItems = failedCount > 0 ? 0 : Math.max(1, Number(row.total_count ?? 1));
    if (failedItems > 0) {
      addQueueCount(queue, queueByType, jobType, "failed", failedItems);
    }
    return;
  }

  if (row.status === "partial_failed") {
    return;
  }

  const remaining = remainingImageJobItems(row);
  if (remaining <= 0) return;
  addQueueCount(queue, queueByType, jobType, row.status === "processing" ? "processing" : "pending", remaining);
}

async function readQueueStateByCounts() {
  const supabase = createSupabaseServiceRoleClient();
  const queue = {
    active_jobs: 0,
    failed: 0,
    pending: 0,
    processing: 0,
  };
  const queueByType = Object.fromEntries(LOCAL_WORKER_JOB_TYPES.map((type) => [type, emptyQueueCounts()])) as Record<
    LocalWorkerJobType,
    ReturnType<typeof emptyQueueCounts>
  >;
  const statuses: QueueStatus[] = ["pending", "processing", "failed"];

  const { data: imageJobRows, error: imageJobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,status,total_count,success_count,failed_count,updated_at")
    .in("job_type", IMAGE_WORKER_JOB_TYPES)
    .in("status", QUEUE_IMAGE_JOB_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(IMAGE_JOB_SUMMARY_LIMIT);

  if (imageJobError) {
    throw new Error(imageJobError.message);
  }

  const imageJobs = ((imageJobRows ?? []) as unknown as ImageJobQueueRow[]);
  for (const row of imageJobs) {
    addImageJobSummary(queue, queueByType, row);
  }
  const activeJobRows = imageJobs
    .filter((row) => ACTIVE_IMAGE_JOB_STATUSES.includes(row.status as (typeof ACTIVE_IMAGE_JOB_STATUSES)[number]))
    .slice(0, 8);

  const extraCounts = await Promise.all([
    ...statuses.map(async (status) => ({
      count: await countRowsByStatus(supabase, "asset_delete_jobs", status, { allowMissing: true }),
      jobType: "asset_delete" as const,
      status,
    })),
    ...statuses.map(async (status) => ({
      count: await countRowsByStatus(supabase, "collector_operation_jobs", status, { allowMissing: true }),
      jobType: "collector_operation" as const,
      status,
    })),
    ...statuses.map(async (status) => ({
      count: await countRowsByStatus(supabase, "export_records", status, { allowMissing: true, exportType: "images_zip" }),
      jobType: "export_images_zip" as const,
      status,
    })),
    ...statuses.map(async (status) => ({
      count: await countRowsByStatus(supabase, "ai_image_jobs", status, { allowMissing: true }),
      jobType: "ai_generate_image" as const,
      status,
    })),
    ...statuses.map(async (status) => ({
      count: await countRowsByStatus(supabase, "ai_split_grid_jobs", status, { allowMissing: true }),
      jobType: "ai_split_grid" as const,
      status,
    })),
    ...statuses.map(async (status) => ({
      count: await countRowsByStatus(supabase, "ai_apply_pattern_jobs", status, { allowMissing: true }),
      jobType: "ai_apply_pattern" as const,
      status,
    })),
  ]);

  for (const item of extraCounts) {
    addQueueCount(queue, queueByType, item.jobType, item.status, item.count);
  }

  const extraActiveJobs = extraCounts
    .filter((item) => item.status === "pending" || item.status === "processing")
    .reduce((sum, item) => sum + item.count, 0);
  queue.active_jobs = activeJobRows.length + extraActiveJobs;

  return {
    active_jobs: activeJobRows,
    queue,
    queue_by_type: queueByType,
  };
}

async function readQueueState() {
  return readQueueStateByCounts();
}

async function hasStatusAccess(request: Request) {
  const secret = getLocalWorkerSecret();
  const authorization = request.headers.get("authorization") ?? "";

  if (secret && authorization === `Bearer ${secret}`) {
    return true;
  }

  try {
    const profile = await getCurrentProfile();
    return profile?.status === "active";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!(await hasStatusAccess(request))) {
    return NextResponse.json(
      { error: "Unauthorized", ok: false },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const bypassCache = new URL(request.url).searchParams.get("fresh") === "1";
  if (!bypassCache && workerStatusCache && workerStatusCache.expiresAt > Date.now()) {
    return NextResponse.json(workerStatusCache.payload, {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  try {
    const [workerState, queueState] = await Promise.all([readWorkerState(), readQueueState()]);
    const updatedAtMs = workerState?.updated_at ? Date.parse(workerState.updated_at) : Number.NaN;
    const lastSeenSeconds = Number.isFinite(updatedAtMs) ? Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000)) : null;
    const heartbeatMs = numberOrNull(workerState?.heartbeat_ms) ?? 5000;
    const staleAfterSeconds = Math.max(15, Math.ceil((heartbeatMs * 4) / 1000));
    const online = lastSeenSeconds !== null && lastSeenSeconds <= staleAfterSeconds;
    const workerJobTypes = normalizeWorkerJobTypes(workerState?.job_types);
    const missingJobTypes = LOCAL_WORKER_JOB_TYPES.filter((jobType) => !workerJobTypes.includes(jobType));
    const blockedJobTypes = missingJobTypes.filter((jobType) => {
      const counts = queueState.queue_by_type[jobType];
      return counts.pending + counts.processing > 0;
    });

    const payload: WorkerStatusPayload = {
      blocked_job_types: blockedJobTypes,
      expected_job_types: LOCAL_WORKER_JOB_TYPES,
      last_seen_seconds: lastSeenSeconds,
      missing_job_types: missingJobTypes,
      ok: true,
      online,
      queue: queueState.queue,
      queue_by_type: queueState.queue_by_type,
      ready: online && missingJobTypes.length === 0,
      state_file: getWorkerStateFile(),
      stale_after_seconds: staleAfterSeconds,
      worker: workerState
        ? {
            concurrency: workerState.concurrency ?? null,
            job_type_limits: workerState.job_type_limits ?? {},
            job_types: workerJobTypes,
            slots: workerState.slots ?? [],
            started_at: workerState.started_at ?? null,
            updated_at: workerState.updated_at ?? null,
            worker: workerState.worker ?? "local-image-worker",
          }
        : null,
      worker_jobs: queueState.active_jobs,
    };
    workerStatusCache = {
      expiresAt: Date.now() + WORKER_STATUS_CACHE_TTL_MS,
      payload,
    };

    return NextResponse.json(
      payload,
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to read local worker status",
        ok: false,
      },
      { status: 500 },
    );
  }
}
