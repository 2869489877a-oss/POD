import { NextResponse } from "next/server";

import { runImageCollectionTemplate } from "@/lib/image-collector/collector";

export const runtime = "nodejs";

function getTemplateId(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const runIndex = parts.lastIndexOf("run");
  return decodeURIComponent(parts[runIndex - 1] ?? "");
}

export async function POST(request: Request) {
  const templateId = getTemplateId(request);

  if (!templateId) {
    return NextResponse.json({ error: "缺少采集模板 ID" }, { status: 400 });
  }

  try {
    const run = await runImageCollectionTemplate(templateId);

    return NextResponse.json({
      ok: true,
      run,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "采集运行失败", ok: false },
      { status: 500 },
    );
  }
}
