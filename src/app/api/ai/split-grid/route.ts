import { NextResponse } from "next/server";

import {
  createAiSplitGridJob,
  executeSplitGrid,
  integerValue,
  parseSourceNames,
  stringValue,
  type SplitGridJobInput,
} from "@/lib/ai-image/split-grid-worker-jobs";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type SplitGridRequest = {
  async?: unknown;
  columns?: unknown;
  image_url?: unknown;
  queue?: unknown;
  rows?: unknown;
  save_to_assets?: unknown;
  source_names?: unknown;
  split_mode?: unknown;
  transparent_background?: unknown;
  wait?: unknown;
};

function shouldQueue(body: SplitGridRequest) {
  return body.queue === true || body.async === true || body.wait === false;
}

function buildInput(body: SplitGridRequest): SplitGridJobInput | { error: string } {
  const imageUrl = stringValue(body.image_url);
  if (!imageUrl) {
    return { error: "缺少待拆分图片 URL" };
  }

  const requestedSplitMode = stringValue(body.split_mode);

  return {
    columns: integerValue(body.columns, 2, 1, 4),
    imageUrl,
    rows: integerValue(body.rows, 2, 1, 4),
    saveToAssets: body.save_to_assets !== false,
    sourceNames: parseSourceNames(body.source_names),
    splitMode: requestedSplitMode === "content" ? "content" : "grid",
    transparentBackground: body.transparent_background === true,
  };
}

export async function POST(request: Request) {
  let body: SplitGridRequest;

  try {
    body = (await request.json()) as SplitGridRequest;
  } catch {
    return NextResponse.json({ error: "无法解析拆图请求" }, { status: 400 });
  }

  const input = buildInput(body);
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    if (shouldQueue(body)) {
      const job = await createAiSplitGridJob(createSupabaseServiceRoleClient(), input);
      return NextResponse.json(
        {
          job_id: job.id,
          queued: true,
          status: "pending",
        },
        { status: 202 },
      );
    }

    const result = await executeSplitGrid(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "拆分四宫格结果失败" },
      { status: 500 },
    );
  }
}
