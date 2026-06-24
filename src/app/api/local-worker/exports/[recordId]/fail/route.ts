import { NextResponse } from "next/server";

import { failExportImagesZipJob } from "@/lib/exports/worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getRecordId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const exportsIndex = segments.indexOf("exports");
  return exportsIndex >= 0 ? decodeURIComponent(segments[exportsIndex + 1] ?? "") : "";
}

export async function POST(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const recordId = getRecordId(request);
  if (!recordId) {
    return NextResponse.json({ error: "缺少导出记录 ID", ok: false }, { status: 400 });
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
        : "本地 worker 导出失败";

  try {
    const record = await failExportImagesZipJob(
      createSupabaseServiceRoleClient(),
      recordId,
      errorMessage,
    );

    return NextResponse.json({
      ok: true,
      record,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出任务失败状态回写失败", ok: false },
      { status: 500 },
    );
  }
}
