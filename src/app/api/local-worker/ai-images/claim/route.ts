import { NextResponse } from "next/server";

import { claimAiGenerateImageJob } from "@/lib/ai-image/worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  try {
    const job = await claimAiGenerateImageJob(createSupabaseServiceRoleClient());

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "领取 AI 生图任务失败", ok: false },
      { status: 500 },
    );
  }
}
