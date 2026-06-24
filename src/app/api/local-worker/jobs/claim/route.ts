import { NextResponse } from "next/server";

import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { claimLocalWorkerItem, type LocalWorkerJobType } from "@/lib/local-worker/image-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_JOB_TYPES: LocalWorkerJobType[] = ["cutout", "print_extraction", "mockup", "resize"];
const allowedJobTypes = new Set<LocalWorkerJobType>(DEFAULT_JOB_TYPES);

function parseJobTypes(value: unknown): LocalWorkerJobType[] {
  if (!Array.isArray(value)) {
    return DEFAULT_JOB_TYPES;
  }

  const jobTypes = value.filter(
    (item): item is LocalWorkerJobType => typeof item === "string" && allowedJobTypes.has(item as LocalWorkerJobType),
  );

  return jobTypes.length > 0 ? Array.from(new Set(jobTypes)) : DEFAULT_JOB_TYPES;
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  let body: { jobTypes?: unknown; job_types?: unknown } = {};

  try {
    body = (await request.json()) as { jobTypes?: unknown; job_types?: unknown };
  } catch {
    body = {};
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await claimLocalWorkerItem(supabase, parseJobTypes(body.jobTypes ?? body.job_types));

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "领取本地 worker 任务失败", ok: false },
      { status: 500 },
    );
  }
}
