import { NextResponse } from "next/server";

import { createAndProcessMockupJob } from "@/lib/mockups/mockup-job";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CreateMockupJobRequest = {
  asset_ids?: unknown;
  template_id?: unknown;
};

function getUniqueAssetIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)),
  );
}

export async function POST(request: Request) {
  let body: CreateMockupJobRequest;

  try {
    body = (await request.json()) as CreateMockupJobRequest;
  } catch {
    return NextResponse.json({ error: "无法读取套图任务参数" }, { status: 400 });
  }

  const assetIds = getUniqueAssetIds(body.asset_ids);

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "请选择至少一张素材图片" }, { status: 400 });
  }

  if (typeof body.template_id !== "string" || body.template_id.length === 0) {
    return NextResponse.json({ error: "请选择一个套图模板" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();

  try {
    const job = await createAndProcessMockupJob(supabase, assetIds, body.template_id);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "套图任务处理失败" },
      { status: 500 },
    );
  }
}
