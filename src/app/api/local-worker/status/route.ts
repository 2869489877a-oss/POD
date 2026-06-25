import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const IMAGE_WORKER_JOB_TYPES = ["cutout", "print_extraction", "mockup", "resize", "infringement_check"] as const;
const LOCAL_WORKER_JOB_TYPES = [...IMAGE_WORKER_JOB_TYPES, "asset_delete", "collector_operation", "export_images_zip", "ai_split_grid", "ai_apply_pattern", "ai_generate_image"] as const;

type LocalWorkerJobType = (typeof LOCAL_WORKER_JOB_TYPES)[number];
type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;
type QueueStatus = "pending" | "processing" | "failed";

type WorkerState = {
  concurrency?: number;
  heartbeat_ms?: number;
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

function normalizeWorkerJobTypes(value: unknown) {
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

async function countImageItemsByTypeAndStatus(
  supabase: SupabaseServiceClient,
  jobType: (typeof IMAGE_WORKER_JOB_TYPES)[number],
  status: QueueStatus,
) {
  const { count, error } = await supabase
    .from("image_job_items")
    .select("id,image_jobs!inner(job_type)", { count: "exact", head: true })
    .eq("status", status)
    .eq("image_jobs.job_type", jobType);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
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

  const { data: activeJobRows, error: activeJobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,status,total_count,success_count,failed_count,updated_at")
    .in("job_type", IMAGE_WORKER_JOB_TYPES)
    .in("status", ["pending", "processing"])
    .order("updated_at", { ascending: false })
    .limit(8);

  if (activeJobError) {
    throw new Error(activeJobError.message);
  }

  const imageCounts = await Promise.all(
    IMAGE_WORKER_JOB_TYPES.flatMap((jobType) =>
      statuses.map(async (status) => ({
        count: await countImageItemsByTypeAndStatus(supabase, jobType, status),
        jobType,
        status,
      })),
    ),
  );

  for (const item of imageCounts) {
    addQueueCount(queue, queueByType, item.jobType, item.status, item.count);
  }

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

  queue.active_jobs =
    queue.pending +
    queue.processing -
    queueByType.cutout.pending -
    queueByType.cutout.processing -
    queueByType.print_extraction.pending -
    queueByType.print_extraction.processing -
    queueByType.mockup.pending -
    queueByType.mockup.processing -
    queueByType.resize.pending -
    queueByType.resize.processing -
    queueByType.infringement_check.pending -
    queueByType.infringement_check.processing +
    (activeJobRows?.length ?? 0);

  return {
    active_jobs: activeJobRows ?? [],
    queue,
    queue_by_type: queueByType,
  };
}

async function readQueueState() {
  return readQueueStateByCounts();
}
export async function GET() {
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

    return NextResponse.json(
      {
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
              job_types: workerJobTypes,
              slots: workerState.slots ?? [],
              started_at: workerState.started_at ?? null,
              updated_at: workerState.updated_at ?? null,
              worker: workerState.worker ?? "local-image-worker",
            }
          : null,
        worker_jobs: queueState.active_jobs,
      },
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
