import { NextResponse } from "next/server";

import { getInfringementWorkerPayload } from "@/lib/infringement/worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getItemId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const jobsIndex = segments.indexOf("jobs");
  return jobsIndex >= 0 ? decodeURIComponent(segments[jobsIndex + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const itemId = getItemId(request);
  if (!itemId) {
    return NextResponse.json({ error: "缺少 worker 子任务 ID", ok: false }, { status: 400 });
  }

  try {
    const includeReferenceItems = new URL(request.url).searchParams.get("include_reference") !== "0";
    const payload = await getInfringementWorkerPayload(createSupabaseServiceRoleClient(), itemId, {
      includeReferenceItems,
    });

    return NextResponse.json({
      ok: true,
      payload,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取 worker 任务数据失败", ok: false },
      { status: 500 },
    );
  }
}
