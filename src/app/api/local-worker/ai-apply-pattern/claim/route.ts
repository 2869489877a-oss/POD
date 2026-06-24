import { NextResponse } from "next/server";

import { claimAiApplyPatternJob } from "@/lib/ai-image/apply-pattern-worker-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function verifyWorker(request: Request) {
  const secret = process.env.LOCAL_WORKER_SECRET || process.env.WORKER_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!verifyWorker(request)) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const job = await claimAiApplyPatternJob(supabase);
    return NextResponse.json({ job, ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "领取贴图任务失败", ok: false },
      { status: 500 },
    );
  }
}
