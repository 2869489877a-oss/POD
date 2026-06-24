import { NextResponse } from "next/server";

import { executeAssetDeleteJob } from "@/lib/assets/delete-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = segments.indexOf("asset-delete");
  return index >= 0 ? decodeURIComponent(segments[index + 1] ?? "") : "";
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const jobId = getJobId(request);
  if (!jobId) {
    return NextResponse.json({ error: "Missing asset delete job id", ok: false }, { status: 400 });
  }

  try {
    const job = await executeAssetDeleteJob(createSupabaseServiceRoleClient(), jobId);

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete asset delete job", ok: false },
      { status: 500 },
    );
  }
}
