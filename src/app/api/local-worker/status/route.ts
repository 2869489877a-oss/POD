import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const IMAGE_WORKER_JOB_TYPES = ["cutout", "print_extraction", "mockup", "resize", "infringement_check"] as const;
const LOCAL_WORKER_JOB_TYPES = [...IMAGE_WORKER_JOB_TYPES, "export_images_zip", "ai_split_grid", "ai_apply_pattern", "ai_generate_image"] as const;

type LocalWorkerJobType = (typeof LOCAL_WORKER_JOB_TYPES)[number];

type WorkerState = {
  concurrency?: number;
  heartbeat_ms?: number;
  job_types?: string[];
  slots?: unknown[];
  started_at?: string;
  updated_at?: string;
  worker?: string;
};

type QueueRow = {
  status?: string | null;
  image_jobs?: {
    job_type?: string | null;
  } | null;
};

type ExportQueueRow = {
  status?: string | null;
};

type AiImageQueueRow = {
  status?: string | null;
};

type AiSplitGridQueueRow = {
  status?: string | null;
};

type AiApplyPatternQueueRow = {
  status?: string | null;
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

async function readWorkerState() {
  try {
    const content = await readFile(/* turbopackIgnore: true */ getWorkerStateFile(), "utf8");
    return JSON.parse(content) as WorkerState;
  } catch {
    return null;
  }
}

async function readQueueState() {
  const supabase = createSupabaseServiceRoleClient();
  const { data: itemRows, error: itemError } = await supabase
    .from("image_job_items")
    .select("status,image_jobs!inner(job_type)")
    .in("status", ["pending", "processing", "failed"])
    .in("image_jobs.job_type", IMAGE_WORKER_JOB_TYPES);

  if (itemError) {
    throw new Error(itemError.message);
  }

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

  const { data: exportRows, error: exportError } = await supabase
    .from("export_records")
    .select("status")
    .eq("export_type", "images_zip")
    .in("status", ["pending", "processing"]);

  if (exportError) {
    throw new Error(exportError.message);
  }

  const { data: aiRows, error: aiError } = await supabase
    .from("ai_image_jobs")
    .select("status")
    .in("status", ["pending", "processing"]);

  if (aiError) {
    throw new Error(aiError.message);
  }

  const { data: splitRows, error: splitError } = await supabase
    .from("ai_split_grid_jobs")
    .select("status")
    .in("status", ["pending", "processing"]);

  if (splitError) {
    throw new Error(splitError.message);
  }

  const { data: applyRows, error: applyError } = await supabase
    .from("ai_apply_pattern_jobs")
    .select("status")
    .in("status", ["pending", "processing"]);

  if (applyError) {
    throw new Error(applyError.message);
  }

  const queue = {
    active_jobs:
      (activeJobRows?.length ?? 0) +
      ((exportRows ?? []).filter((row) => row.status === "pending" || row.status === "processing").length) +
      ((aiRows ?? []).filter((row) => row.status === "pending" || row.status === "processing").length) +
      ((splitRows ?? []).filter((row) => row.status === "pending" || row.status === "processing").length) +
      ((applyRows ?? []).filter((row) => row.status === "pending" || row.status === "processing").length),
    failed: 0,
    pending: 0,
    processing: 0,
  };
  const queueByType = Object.fromEntries(LOCAL_WORKER_JOB_TYPES.map((type) => [type, emptyQueueCounts()])) as Record<
    LocalWorkerJobType,
    ReturnType<typeof emptyQueueCounts>
  >;

  for (const row of (itemRows ?? []) as QueueRow[]) {
    if (row.status === "pending") queue.pending += 1;
    if (row.status === "processing") queue.processing += 1;
    if (row.status === "failed") queue.failed += 1;

    const jobType = row.image_jobs?.job_type;
    if (jobType && jobType in queueByType) {
      if (row.status === "pending") queueByType[jobType as LocalWorkerJobType].pending += 1;
      if (row.status === "processing") queueByType[jobType as LocalWorkerJobType].processing += 1;
      if (row.status === "failed") queueByType[jobType as LocalWorkerJobType].failed += 1;
    }
  }

  for (const row of (exportRows ?? []) as ExportQueueRow[]) {
    if (row.status === "pending") {
      queue.pending += 1;
      queueByType.export_images_zip.pending += 1;
    }
    if (row.status === "processing") {
      queue.processing += 1;
      queueByType.export_images_zip.processing += 1;
    }
  }

  for (const row of (aiRows ?? []) as AiImageQueueRow[]) {
    if (row.status === "pending") {
      queue.pending += 1;
      queueByType.ai_generate_image.pending += 1;
    }
    if (row.status === "processing") {
      queue.processing += 1;
      queueByType.ai_generate_image.processing += 1;
    }
  }

  for (const row of (splitRows ?? []) as AiSplitGridQueueRow[]) {
    if (row.status === "pending") {
      queue.pending += 1;
      queueByType.ai_split_grid.pending += 1;
    }
    if (row.status === "processing") {
      queue.processing += 1;
      queueByType.ai_split_grid.processing += 1;
    }
  }

  for (const row of (applyRows ?? []) as AiApplyPatternQueueRow[]) {
    if (row.status === "pending") {
      queue.pending += 1;
      queueByType.ai_apply_pattern.pending += 1;
    }
    if (row.status === "processing") {
      queue.processing += 1;
      queueByType.ai_apply_pattern.processing += 1;
    }
  }

  return {
    active_jobs: activeJobRows ?? [],
    queue,
    queue_by_type: queueByType,
  };
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
