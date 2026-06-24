import { NextResponse } from "next/server";

import { completeExportImagesZipJob } from "@/lib/exports/worker-jobs";
import { requireLocalWorkerAuth } from "@/lib/local-worker/auth";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getRecordId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const exportsIndex = segments.indexOf("exports");
  return exportsIndex >= 0 ? decodeURIComponent(segments[exportsIndex + 1] ?? "") : "";
}

async function readArchive(form: FormData) {
  const value = form.get("archive") ?? form.get("file");

  if (!value || typeof value === "string") {
    return null;
  }

  return {
    buffer: Buffer.from(await value.arrayBuffer()),
    contentType: value.type || "application/zip",
    filename: value.name || "product-images.zip",
  };
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

  try {
    const form = await request.formData();
    const archive = await readArchive(form);

    if (!archive) {
      return NextResponse.json({ error: "缺少 ZIP 文件", ok: false }, { status: 400 });
    }

    const record = await completeExportImagesZipJob(
      createSupabaseServiceRoleClient(),
      recordId,
      archive,
    );

    return NextResponse.json({
      ok: true,
      record,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出任务完成状态回写失败", ok: false },
      { status: 500 },
    );
  }
}
