import { NextResponse } from "next/server";

import { getExportRecord } from "@/lib/exports/records";

export const runtime = "nodejs";

function getRecordId(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const recordsIndex = segments.indexOf("records");
  return recordsIndex >= 0 ? decodeURIComponent(segments[recordsIndex + 1] ?? "") : "";
}

export async function GET(request: Request) {
  const recordId = getRecordId(request);

  if (!recordId) {
    return NextResponse.json({ error: "缺少导出记录 ID" }, { status: 400 });
  }

  try {
    const record = await getExportRecord(recordId);
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取导出记录失败" },
      { status: 500 },
    );
  }
}
