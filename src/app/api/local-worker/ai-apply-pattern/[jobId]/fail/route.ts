import { NextResponse } from "next/server";

import { failAiApplyPatternJob } from "@/lib/ai-image/apply-pattern-worker-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function verifyWorker(request: Request) {
  const secret = process.env.LOCAL_WORKER_SECRET || process.env.WORKER_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

function getJobId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const applyIndex = segments.indexOf("ai-apply-pattern");
  return applyIndex >= 0 ? decodeURIComponent(segments[applyIndex + 1] ?? "") : "";
}

export async function POST(request: Request) {
  if (!verifyWorker(request)) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const jobId = getJobId(request);
  if (!jobId) {
    return NextResponse.json({ error: "缺少贴图任务 ID", ok: false }, { status: 400 });
  }

  let body: { error?: unknown } = {};
  try {
    body = (await request.json()) as { error?: unknown };
  } catch {
    body = {};
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const result = await failAiApplyPatternJob(
      supabase,
      jobId,
      typeof body.error === "string" && body.error.trim() ? body.error.trim() : "贴图任务失败",
    );
    return NextResponse.json({ job: result, ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "贴图失败状态回写失败", ok: false },
      { status: 500 },
    );
  }
}
