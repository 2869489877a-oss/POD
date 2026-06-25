import { NextResponse } from "next/server";

import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { failCollectorOperationJob } from "@/lib/storage/collector-operation-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = segments.indexOf("collector-operations");
  return index >= 0 ? decodeURIComponent(segments[index + 1] ?? "") : "";
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const jobId = getJobId(request);
  if (!jobId) {
    return NextResponse.json({ error: "Missing collector operation job id", ok: false }, { status: 400 });
  }

  let body: { error?: unknown } = {};

  try {
    body = (await request.json()) as { error?: unknown };
  } catch {
    body = {};
  }

  try {
    const job = await failCollectorOperationJob(
      createSupabaseServiceRoleClient(),
      jobId,
      typeof body.error === "string" && body.error.trim() ? body.error.trim() : "Collector operation worker failed",
    );

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark collector operation job failed", ok: false },
      { status: 500 },
    );
  }
}
