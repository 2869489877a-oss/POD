import { NextResponse } from "next/server";

import { getResizePreset } from "@/lib/image-processing/resize-presets";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CreateResizeJobRequest = {
  asset_ids?: unknown;
  preset_key?: unknown;
};

type AssetForJob = {
  id: string;
  original_url: string;
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
  let body: CreateResizeJobRequest;

  try {
    body = (await request.json()) as CreateResizeJobRequest;
  } catch {
    return NextResponse.json({ error: "无法读取任务参数" }, { status: 400 });
  }

  const assetIds = getUniqueAssetIds(body.asset_ids);
  const preset = getResizePreset(body.preset_key);

  if (assetIds.length === 0) {
    return NextResponse.json({ error: "请选择至少一张图片" }, { status: 400 });
  }

  if (!preset) {
    return NextResponse.json({ error: "请选择有效的尺寸预设" }, { status: 400 });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: assetData, error: assetError } = await supabase
    .from("assets")
    .select("id,original_url")
    .in("id", assetIds);

  if (assetError) {
    return NextResponse.json({ error: assetError.message }, { status: 500 });
  }

  const assets = (assetData ?? []) as unknown as AssetForJob[];

  if (assets.length !== assetIds.length) {
    return NextResponse.json({ error: "部分素材不存在，请刷新后重试" }, { status: 400 });
  }

  const { data: jobData, error: jobError } = await supabase
    .from("image_jobs")
    .insert({
      failed_count: 0,
      job_type: "resize",
      options: {
        asset_ids: assetIds,
        background: preset.background,
        height: preset.height,
        output_format: preset.extension,
        preset_key: preset.key,
        preset_label: preset.label,
        width: preset.width,
      },
      status: "pending",
      success_count: 0,
      total_count: assets.length,
    })
    .select("id,status,total_count,success_count,failed_count")
    .single();

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 });
  }

  const job = jobData as unknown as {
    failed_count: number;
    id: string;
    status: string;
    success_count: number;
    total_count: number;
  };

  const { error: itemError } = await supabase.from("image_job_items").insert(
    assets.map((asset) => ({
      asset_id: asset.id,
      input_url: asset.original_url,
      job_id: job.id,
      status: "pending",
    })),
  );

  if (itemError) {
    await supabase
      .from("image_jobs")
      .update({
        error_message: itemError.message,
        failed_count: assets.length,
        status: "failed",
      })
      .eq("id", job.id);

    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  return NextResponse.json({
    job,
    message: "批量改尺寸任务已创建",
  });
}
