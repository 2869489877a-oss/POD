import { NextResponse } from "next/server";

import { getExportImagesZipPayload } from "@/lib/exports/worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getRecordId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const exportsIndex = segments.indexOf("exports");
  return exportsIndex >= 0 ? decodeURIComponent(segments[exportsIndex + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const authError = requireLocalWorkerAuth(request);
  if (authError) {
    return authError;
  }

  const recordId = getRecordId(request);
  if (!recordId) {
    return NextResponse.json({ error: "缺少导出记录 ID", ok: false }, { status: 400 });
  }

  try {
    const payload = await getExportImagesZipPayload(createSupabaseServiceRoleClient(), recordId);

    return NextResponse.json({
      ok: true,
      payload,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取导出任务数据失败", ok: false },
      { status: 500 },
    );
  }
}
