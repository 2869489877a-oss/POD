import { NextResponse } from "next/server";

import { failAiSplitGridJob } from "@/lib/ai-image/split-grid-worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const splitIndex = segments.indexOf("ai-split-grid");
  return splitIndex >= 0 ? decodeURIComponent(segments[splitIndex + 1] ?? "") : "";
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const jobId = getJobId(request);
  if (!jobId) {
    return NextResponse.json({ error: "缺少拆图任务 ID", ok: false }, { status: 400 });
  }

  let body: { error?: unknown; error_message?: unknown } = {};

  try {
    body = (await request.json()) as { error?: unknown; error_message?: unknown };
  } catch {
    body = {};
  }

  const errorMessage =
    typeof body.error === "string"
      ? body.error
      : typeof body.error_message === "string"
        ? body.error_message
        : "本地 worker 拆图失败";

  try {
    const job = await failAiSplitGridJob(createSupabaseServiceRoleClient(), jobId, errorMessage);

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "拆图失败状态回写失败", ok: false },
      { status: 500 },
    );
  }
}
