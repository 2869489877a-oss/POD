import { NextResponse } from "next/server";

import { getAiApplyPatternJob } from "@/lib/ai-image/apply-pattern-worker-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const applyIndex = segments.indexOf("generate-and-apply");
  return applyIndex >= 0 ? decodeURIComponent(segments[applyIndex + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const jobId = getJobId(request);

  if (!jobId) {
    return NextResponse.json({ error: "缺少贴图任务 ID" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await getAiApplyPatternJob(supabase, jobId);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取贴图任务失败" },
      { status: 500 },
    );
  }
}
