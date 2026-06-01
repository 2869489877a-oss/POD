import { NextResponse } from "next/server";

import { retryFailedImageJobItems } from "@/lib/image-jobs/retry-failed";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const imageJobsIndex = segments.indexOf("image-jobs");
  return imageJobsIndex >= 0 ? decodeURIComponent(segments[imageJobsIndex + 1] ?? "") : "";
}

export async function POST(request: Request) {
  const jobId = getJobId(request);
  let body: { item_ids?: unknown } = {};

  if (!jobId) {
    return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
  }

  try {
    body = (await request.json()) as { item_ids?: unknown };
  } catch {
    body = {};
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await retryFailedImageJobItems(supabase, jobId, body.item_ids);

    return NextResponse.json({
      job,
      message: "失败项已重新执行",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "重新执行失败任务失败" },
      { status: 500 },
    );
  }
}
