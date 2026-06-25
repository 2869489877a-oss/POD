import { NextResponse } from "next/server";

import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { executeCollectorOperationJob } from "@/lib/storage/collector-operation-jobs";
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

  try {
    const job = await executeCollectorOperationJob(createSupabaseServiceRoleClient(), jobId);

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete collector operation job", ok: false },
      { status: 500 },
    );
  }
}
