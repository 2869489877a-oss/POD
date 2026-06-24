import { NextResponse } from "next/server";

import { getAiSplitGridJob } from "@/lib/ai-image/split-grid-worker-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const splitGridIndex = segments.indexOf("split-grid");
  return splitGridIndex >= 0 ? decodeURIComponent(segments[splitGridIndex + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const jobId = getJobId(request);

  if (!jobId) {
    return NextResponse.json({ error: "缺少拆图任务 ID" }, { status: 400 });
  }

  try {
    const job = await getAiSplitGridJob(createSupabaseServiceRoleClient(), jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取拆图任务失败" },
      { status: 500 },
    );
  }
}
