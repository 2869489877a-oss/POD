import { NextResponse } from "next/server";

import { getCollectorOperationJob } from "@/lib/storage/collector-operation-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const index = segments.indexOf("jobs");
  return index >= 0 ? decodeURIComponent(segments[index + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const jobId = getJobId(request);
  if (!jobId) {
    return NextResponse.json({ error: "Missing collector operation job id" }, { status: 400 });
  }

  try {
    const job = await getCollectorOperationJob(createSupabaseServiceRoleClient(), jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read collector operation job" },
      { status: 500 },
    );
  }
}
