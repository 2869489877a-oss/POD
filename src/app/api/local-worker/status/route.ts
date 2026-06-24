import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const LOCAL_WORKER_JOB_TYPES = ["cutout", "print_extraction", "mockup"];

type WorkerState = {
  concurrency?: number;
  heartbeat_ms?: number;
  job_types?: string[];
  slots?: unknown[];
  started_at?: string;
  updated_at?: string;
  worker?: string;
};

function getLocalAssetsDir() {
  return path.resolve(
    process.env.LOCAL_ASSETS_DIR ||
      (process.platform === "win32"
        ? path.join(os.tmpdir(), "pod-ai-data", "assets")
        : "/wmsFile/pod-ai-data/assets"),
  );
}

function getWorkerStateFile() {
  return path.resolve(
    process.env.LOCAL_WORKER_STATE_FILE || path.join(path.dirname(getLocalAssetsDir()), "worker-status.json"),
  );
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
    .in("image_jobs.job_type", LOCAL_WORKER_JOB_TYPES);

  if (itemError) {
    throw new Error(itemError.message);
  }

  const { data: activeJobRows, error: activeJobError } = await supabase
    .from("image_jobs")
    .select("id,job_type,status,total_count,success_count,failed_count,updated_at")
    .in("job_type", LOCAL_WORKER_JOB_TYPES)
    .in("status", ["pending", "processing"])
    .order("updated_at", { ascending: false })
    .limit(8);

  if (activeJobError) {
    throw new Error(activeJobError.message);
  }

  const queue = {
    active_jobs: activeJobRows?.length ?? 0,
    failed: 0,
    pending: 0,
    processing: 0,
  };

  for (const row of (itemRows ?? []) as Array<{ status?: string }>) {
    if (row.status === "pending") queue.pending += 1;
    if (row.status === "processing") queue.processing += 1;
    if (row.status === "failed") queue.failed += 1;
  }

  return {
    active_jobs: activeJobRows ?? [],
    queue,
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

    return NextResponse.json(
      {
        last_seen_seconds: lastSeenSeconds,
        ok: true,
        online,
        queue: queueState.queue,
        state_file: getWorkerStateFile(),
        stale_after_seconds: staleAfterSeconds,
        worker: workerState
          ? {
              concurrency: workerState.concurrency ?? null,
              job_types: workerState.job_types ?? [],
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
