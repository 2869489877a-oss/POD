import { NextResponse } from "next/server";

import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { failLocalWorkerItem } from "@/lib/local-worker/image-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getItemId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const jobsIndex = segments.indexOf("jobs");
  return jobsIndex >= 0 ? decodeURIComponent(segments[jobsIndex + 1] ?? "") : "";
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const itemId = getItemId(request);
  if (!itemId) {
    return NextResponse.json({ error: "缺少 worker 子任务 ID", ok: false }, { status: 400 });
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
        : "本地 worker 处理失败";

  try {
    const job = await failLocalWorkerItem(createSupabaseServiceRoleClient(), itemId, errorMessage);

    return NextResponse.json({
      job,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "本地 worker 失败状态回写失败", ok: false },
      { status: 500 },
    );
  }
}
