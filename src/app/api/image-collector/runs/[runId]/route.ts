import { NextResponse } from "next/server";

import { getImageCollectionRunDetail } from "@/lib/image-collector/collector";

export const runtime = "nodejs";

function getRunId(request: Request) {
  const pathname = new URL(request.url).pathname;
  return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "");
}

export async function GET(request: Request) {
  const runId = getRunId(request);

  if (!runId) {
    return NextResponse.json({ error: "缺少采集运行 ID" }, { status: 400 });
  }

  try {
    const run = await getImageCollectionRunDetail(runId);

    if (!run) {
      return NextResponse.json({ error: "采集运行记录不存在" }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取采集运行详情失败" },
      { status: 500 },
    );
  }
}
